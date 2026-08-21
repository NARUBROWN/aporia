import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { parseDdl } from "./seed-lca-normalized";

type SourceColumn = ReturnType<typeof parseDdl>["columns"][number];
type SourceTable = ReturnType<typeof parseDdl> & {
  dataPath: string;
  sourceRows: number;
};

const FIELD_TERMINATOR = "~*~";
const ROW_TERMINATOR = "~#~\n";
const EMPTY_SENTINEL = "~E~";
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const args = process.argv.slice(2);
const rootArg = args.find((arg) => !arg.startsWith("--"));
const rootPath = rootArg ? resolve(rootArg) : "";
const projectId = args.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) || "";
const execute = args.includes("--execute");

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function physicalTableName(sheetId: string) {
  return `sheet_${sheetId.replaceAll("-", "")}`;
}

async function* records(path: string) {
  const stream = createReadStream(path, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    let end = buffer.indexOf(ROW_TERMINATOR);
    while (end >= 0) {
      yield buffer.slice(0, end);
      buffer = buffer.slice(end + ROW_TERMINATOR.length);
      end = buffer.indexOf(ROW_TERMINATOR);
    }
  }
  if (buffer.length) {
    const finalRecord = buffer.endsWith("~#~") ? buffer.slice(0, -3) : buffer;
    if (finalRecord.length) yield finalRecord;
  }
}

function splitRecord(record: string) {
  return record.split(FIELD_TERMINATOR).map((value) => {
    if (value === "") return null;
    if (value === EMPTY_SENTINEL) return "";
    return value;
  });
}

function copyValue(value: string | null, column: SourceColumn) {
  if (value === null) return "\\N";
  let normalized = value;
  if (column.postgresType === "BOOLEAN") normalized = /^(1|true)$/i.test(value) ? "t" : "f";
  if (column.postgresType === "BYTEA" && /^0x/i.test(value)) normalized = `\\x${value.slice(2)}`;
  if (/^TIMESTAMP/.test(column.postgresType))
    normalized = normalized.replace(/(\.\d{6})\d+/, "$1");
  return normalized
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

function discoverTables() {
  const schemaPath = join(rootPath, "01_schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  const blocks = [...schema.matchAll(/CREATE\s+TABLE\s+\[dbo\]\.\[(STG_[^\]]+)\]\s*\([\s\S]*?\);/gi)];
  const tables = blocks.map((match, index) => {
    const ddl = match[0];
    const table = parseDdl(ddl, `${String(index + 1).padStart(3, "0")}_dbo.${match[1]}.ddl.sql`);
    const dataPath = join(rootPath, "data", `dbo.${table.name}.dat`);
    const sourceRows = Number(
      readFileSync(join(rootPath, "02_load.sql"), "utf8")
        .match(new RegExp(`dbo\\.${table.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\((\\d+) rows\\)`, "i"))?.[1] || 0,
    );
    if (!statSync(dataPath).isFile()) throw new Error(`${dataPath}: 데이터 파일이 없습니다.`);
    return { ...table, dataPath, sourceRows } satisfies SourceTable;
  });
  if (!tables.length) throw new Error(`${schemaPath}: STG_ CREATE TABLE을 찾지 못했습니다.`);
  return tables;
}

async function sourceHash(tables: SourceTable[]) {
  const hash = createHash("sha256");
  hash.update(readFileSync(join(rootPath, "01_schema.sql")));
  for (const table of tables) {
    hash.update(table.name);
    const stream = createReadStream(table.dataPath);
    for await (const chunk of stream) hash.update(chunk);
  }
  return hash.digest("hex");
}

async function validateTable(table: SourceTable) {
  let rowCount = 0;
  for await (const record of records(table.dataPath)) {
    rowCount++;
    const values = splitRecord(record);
    if (values.length !== table.columns.length)
      throw new Error(`${table.name} ${rowCount}행: ${values.length}개 값, ${table.columns.length}개 컬럼`);
  }
  if (table.sourceRows && rowCount !== table.sourceRows)
    throw new Error(`${table.name}: 명시된 ${table.sourceRows}행과 실제 ${rowCount}행이 다릅니다.`);
  return rowCount;
}

async function importTable(client: pg.PoolClient, batchId: string, table: SourceTable, displayOrder: number) {
  const existing = await client.query<{ row_count: string }>(
    "SELECT row_count FROM project_sheets WHERE project_id=$1 AND name=$2 AND seed_batch_id=$3",
    [projectId, table.name, batchId],
  );
  if (existing.rowCount) {
    const rows = Number(existing.rows[0].row_count);
    console.log(`[건너뜀] ${table.name}: ${rows.toLocaleString()}행`);
    return rows;
  }

  const sheetId = randomUUID();
  const tableName = physicalTableName(sheetId);
  let rowCount = 0;
  let copy: ReturnType<typeof copyFrom> | null = null;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE project_data.${quoteIdentifier(tableName)} (
      _row_id BIGINT GENERATED ALWAYS AS IDENTITY,
      _row_order BIGINT NOT NULL,
      _data_revision BIGINT NOT NULL DEFAULT 0,
      ${table.columns.map((column) => `${quoteIdentifier(column.physicalName)} ${column.postgresType}${column.postgresDefault ? ` DEFAULT ${column.postgresDefault}` : ""}${column.nullable ? "" : " NOT NULL"}`).join(",\n")}
    )`);
    const copyColumns = ["_row_order", ...table.columns.map((column) => column.physicalName)];
    copy = client.query(copyFrom(
      `COPY project_data.${quoteIdentifier(tableName)} (${copyColumns.map(quoteIdentifier).join(",")}) FROM STDIN WITH (FORMAT text)`,
    ));
    copy.on("error", () => undefined);
    for await (const record of records(table.dataPath)) {
      const values = splitRecord(record);
      if (values.length !== table.columns.length)
        throw new Error(`${table.name} ${rowCount + 1}행: ${values.length}개 값, ${table.columns.length}개 컬럼`);
      const line = [String(rowCount), ...values.map((value, index) => copyValue(value, table.columns[index]))].join("\t") + "\n";
      rowCount++;
      if (!copy.write(line)) await once(copy, "drain");
      if (rowCount % 100_000 === 0) console.log(`  ${table.name}: ${rowCount.toLocaleString()}행`);
    }
    copy.end();
    await once(copy, "finish");
    copy = null;
    if (table.sourceRows && rowCount !== table.sourceRows)
      throw new Error(`${table.name}: 명시된 ${table.sourceRows}행과 실제 ${rowCount}행이 다릅니다.`);
    await client.query(`ALTER TABLE project_data.${quoteIdentifier(tableName)} ADD PRIMARY KEY (_row_id)`);
    const primary = table.columns.filter((column) => column.primaryKey);
    if (primary.length)
      await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${tableName}_source_pk`)} ON project_data.${quoteIdentifier(tableName)} (${primary.map((column) => quoteIdentifier(column.physicalName)).join(",")})`);
    await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${tableName}_row_order`)} ON project_data.${quoteIdentifier(tableName)} (_row_order)`);
    await client.query(
      `INSERT INTO project_sheets (id, project_id, name, physical_table_name, display_order, origin, seed_batch_id, row_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,'seed',$6,$7,NOW())`,
      [sheetId, projectId, table.name, tableName, displayOrder, batchId, rowCount],
    );
    for (let index = 0; index < table.columns.length; index++) {
      const column = table.columns[index];
      await client.query(
        `INSERT INTO sheet_columns (id, sheet_id, name, physical_column_name, data_type, display_order, nullable, primary_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), sheetId, column.name, column.physicalName, column.postgresType, index, column.nullable, column.primaryKey],
      );
    }
    await client.query("COMMIT");
    console.log(`[완료] ${table.name}: ${rowCount.toLocaleString()}행`);
    return rowCount;
  } catch (error) {
    try { copy?.destroy(error instanceof Error ? error : new Error(String(error))); } catch { /* 이미 종료됨 */ }
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DROP TABLE IF EXISTS project_data.${quoteIdentifier(tableName)}`).catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (!rootPath) throw new Error("사용법: npm run db:seed:stg -- <lca_seed_bulk 폴더> [--project=<UUID> --execute]");
  const tables = discoverTables();
  const verified = [] as Array<{ table: string; columns: number; rows: number }>;
  for (const table of tables) {
    const rows = await validateTable(table);
    verified.push({ table: table.name, columns: table.columns.length, rows });
    console.log(`[검증] ${table.name}: ${table.columns.length}컬럼, ${rows.toLocaleString()}행`);
  }
  console.log(JSON.stringify({ root: basename(rootPath), execute, tables: tables.length, rows: verified.reduce((sum, item) => sum + item.rows, 0) }));
  if (!execute) return;
  if (!projectId) throw new Error("--execute에는 --project=<UUID>가 필요합니다.");
  if (!connectionString) throw new Error("DIRECT_URL 또는 DATABASE_URL이 필요합니다.");

  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 30_000 });
  const client = await pool.connect();
  let batchId = "";
  try {
    const project = await client.query("SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL", [projectId]);
    if (!project.rowCount) throw new Error(`${projectId}: 활성 프로젝트를 찾지 못했습니다.`);
    const hash = await sourceHash(tables);
    const batch = await client.query<{ id: string }>(
      `INSERT INTO seed_batches (id, project_id, source_filename, source_hash, status, started_at)
       VALUES ($1,$2,$3,$4,'running',NOW())
       ON CONFLICT (project_id, source_hash) DO UPDATE SET status='running', started_at=COALESCE(seed_batches.started_at,NOW())
       RETURNING id`,
      [randomUUID(), projectId, `${basename(rootPath)}:STG_*`, hash],
    );
    batchId = batch.rows[0].id;
    for (let index = 0; index < tables.length; index++) {
      const table = tables[index];
      try {
        await importTable(client, batchId, table, index);
        await client.query("DELETE FROM seed_errors WHERE seed_batch_id=$1 AND source_table=$2", [batchId, table.name]);
        await client.query(
          "UPDATE seed_batches SET imported_rows=(SELECT COALESCE(SUM(row_count),0) FROM project_sheets WHERE seed_batch_id=$1) WHERE id=$1",
          [batchId],
        );
      } catch (error) {
        await client.query(
          `INSERT INTO seed_errors (id, seed_batch_id, source_table, error_code, error_message)
           VALUES ($1,$2,$3,'IMPORT_FAILED',$4)`,
          [randomUUID(), batchId, table.name, error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000)],
        );
        await client.query("UPDATE seed_batches SET status='failed', failed_rows=failed_rows+1 WHERE id=$1", [batchId]);
        throw error;
      }
    }
    await client.query(
      "UPDATE seed_batches SET status='completed', failed_rows=(SELECT COUNT(*) FROM seed_errors WHERE seed_batch_id=$1), completed_at=NOW() WHERE id=$1",
      [batchId],
    );
    console.log(JSON.stringify({ batchId, status: "completed", importedRows: verified.reduce((sum, item) => sum + item.rows, 0) }));
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
