import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { once } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { basename, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { parseBulkRelations } from "../src/lib/lca-relation-parser";

type SourceColumn = {
  name: string;
  sqlServerType: string;
  postgresType: string;
  physicalName: string;
  nullable: boolean;
  primaryKey: boolean;
  postgresDefault?: string;
};

type SourceTable = {
  order: number;
  name: string;
  ddlEntry: string;
  dataEntries: string[];
  columns: SourceColumn[];
};

type ProjectDocumentSheet = {
  id?: unknown;
  name?: unknown;
  columns?: unknown;
  columnTypes?: unknown;
  rows?: unknown;
  color?: unknown;
  comment?: unknown;
  columnColors?: unknown;
  columnComments?: unknown;
};

type SnapshotRelation = {
  sourceSheetId?: unknown;
  sourceColumn?: unknown;
  targetSheetId?: unknown;
  targetColumn?: unknown;
  relationType?: unknown;
};

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL 또는 DATABASE_URL이 필요합니다.");

const args = process.argv.slice(2);
const zipArg = args.find((arg) => !arg.startsWith("--"));
const zipPath = zipArg ? resolve(zipArg) : "";
const projectId = args.find((arg) => arg.startsWith("--project="))?.split("=")[1] || "demo";
const execute = args.includes("--execute");
const maxTables = Number(args.find((arg) => arg.startsWith("--max-tables="))?.split("=")[1] || 0);
const maxRows = Number(args.find((arg) => arg.startsWith("--max-rows="))?.split("=")[1] || 0);
const constraintsPath = args.find((arg) => arg.startsWith("--constraints="))?.slice("--constraints=".length);

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function physicalColumnName(name: string, index: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  return `c_${String(index + 1).padStart(3, "0")}_${slug || "field"}`;
}

function postgresType(sqlServerType: string) {
  const normalized = sqlServerType.toLowerCase().replaceAll(" ", "");
  if (/^(bigint)/.test(normalized)) return "BIGINT";
  if (/^(int|integer)/.test(normalized)) return "INTEGER";
  if (/^(smallint|tinyint)/.test(normalized)) return "SMALLINT";
  if (/^(decimal|numeric)\(/.test(normalized)) return normalized.toUpperCase();
  if (/^(money|smallmoney)/.test(normalized)) return "NUMERIC(19,4)";
  if (/^float/.test(normalized)) return "DOUBLE PRECISION";
  if (/^real/.test(normalized)) return "REAL";
  if (/^bit/.test(normalized)) return "BOOLEAN";
  if (/^date$/.test(normalized)) return "DATE";
  if (/^(datetime2|datetime|smalldatetime)/.test(normalized)) return "TIMESTAMP";
  if (/^time/.test(normalized)) return "TIME";
  if (/^uniqueidentifier/.test(normalized)) return "UUID";
  if (/^(binary|varbinary|image)/.test(normalized)) return "BYTEA";
  return "TEXT";
}

function postgresDefault(definition: string) {
  if (!/\bDEFAULT\b/i.test(definition)) return undefined;
  if (/\b(sysdatetime|sysutcdatetime|getdate)\s*\(\s*\)/i.test(definition)) return "CURRENT_TIMESTAMP";
  const convertedTimestamp = definition.match(/CONVERT\s*\([^,]+,\s*'([^']+)'/i);
  if (convertedTimestamp) return `'${convertedTimestamp[1].replaceAll("'", "''")}'::timestamp`;
  const stringLiteral = definition.match(/DEFAULT\s*\(\s*'([^']*)'\s*\)/i);
  if (stringLiteral) return `'${stringLiteral[1].replaceAll("'", "''")}'`;
  const scalar = definition.match(/DEFAULT\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)/i);
  if (scalar) return scalar[1];
  return undefined;
}

export function parseDdl(ddl: string, ddlEntry = "unknown.ddl.sql"): Omit<SourceTable, "dataEntries"> {
  const create = ddl.match(/CREATE\s+TABLE\s+\[dbo\]\.\[([^\]]+)\]\s*\(([\s\S]*?)\);/i);
  if (!create) throw new Error(`${ddlEntry}: CREATE TABLE을 찾지 못했습니다.`);
  const primaryKeys = new Set<string>();
  for (const match of create[2].matchAll(/PRIMARY\s+KEY\s*\(([^)]+)\)/gi))
    for (const column of match[1].matchAll(/\[([^\]]+)\]/g)) primaryKeys.add(column[1]);
  const columns: SourceColumn[] = [];
  for (const rawLine of create[2].split(/\r?\n/)) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line.startsWith("[")) continue;
    const match = line.match(/^\[([^\]]+)\]\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?(?:\([^)]*\))?)([\s\S]*)$/);
    if (!match) throw new Error(`${ddlEntry}: 컬럼을 해석할 수 없습니다: ${line}`);
    const name = match[1];
    columns.push({
      name,
      sqlServerType: match[2],
      postgresType: postgresType(match[2]),
      physicalName: physicalColumnName(name, columns.length),
      nullable: !/\bNOT\s+NULL\b/i.test(match[3]),
      primaryKey: primaryKeys.has(name),
      postgresDefault: postgresDefault(match[3]),
    });
  }
  const file = basename(ddlEntry);
  const order = Number(file.match(/^(\d+)_/)?.[1] || 0);
  return { order, name: create[1], ddlEntry, columns };
}

export function parseSqlServerValues(line: string) {
  let value = line.trim();
  if (value.endsWith(",") || value.endsWith(";")) value = value.slice(0, -1);
  if (!value.startsWith("(") || !value.endsWith(")")) throw new Error("VALUES 행 형식이 아닙니다.");
  value = value.slice(1, -1);
  const result: Array<string | null> = [];
  let token = "";
  let quoted = false;
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (quoted) {
      if (char === "'" && value[index + 1] === "'") {
        token += "'";
        index++;
      } else if (char === "'") quoted = false;
      else if (char !== undefined) token += char;
      continue;
    }
    if ((char === "N" || char === "n") && value[index + 1] === "'" && token.trim() === "") {
      quoted = true;
      index++;
      continue;
    }
    if (char === "'") {
      quoted = true;
      continue;
    }
    if (char === "," || char === undefined) {
      const trimmed = token.trim();
      result.push(/^NULL$/i.test(trimmed) ? null : trimmed);
      token = "";
      continue;
    }
    token += char;
  }
  if (quoted) throw new Error("닫히지 않은 문자열입니다.");
  return result;
}

function copyValue(value: string | null, column: SourceColumn) {
  if (value === null) return "\\N";
  let normalized = value;
  if (column.postgresType === "BOOLEAN") normalized = /^(1|true)$/i.test(value) ? "t" : "f";
  if (column.postgresType === "BYTEA" && /^0x/i.test(value)) normalized = `\\x${value.slice(2)}`;
  return normalized.replaceAll("\\", "\\\\").replaceAll("\t", "\\t").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
}

function zipEntries() {
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readZipEntry(entry: string) {
  return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

async function* readLines(stream: NodeJS.ReadableStream) {
  stream.setEncoding("utf8");
  let buffer = "";
  for await (const chunk of stream as AsyncIterable<string>) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      yield line;
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer) yield buffer.replace(/\r$/, "");
}

async function sourceHash() {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
  return hash.digest("hex");
}

function discoverTables() {
  const entries = zipEntries();
  const ddlEntries = entries.filter((entry) => /\d+_dbo\..+\.ddl\.sql$/i.test(entry));
  const dataEntries = entries.filter((entry) => /\d+_dbo\..+\.data\.\d+\.sql$/i.test(entry));
  return ddlEntries
    .map((ddlEntry) => {
      const table = parseDdl(readZipEntry(ddlEntry), ddlEntry);
      const prefix = basename(ddlEntry).replace(/\.ddl\.sql$/i, "");
      return {
        ...table,
        dataEntries: dataEntries.filter((entry) => basename(entry).startsWith(`${prefix}.data.`)).sort(),
      } satisfies SourceTable;
    })
    .sort((left, right) => left.order - right.order);
}

function physicalTableName(sheetId: string) {
  return `sheet_${sheetId.replaceAll("-", "")}`;
}

async function waitForWalHeadroom(client: pg.PoolClient, tableName: string) {
  let waiting = false;
  let checks = 0;
  while (true) {
    const result = await client.query<{ wal_bytes: string; max_wal_bytes: string }>(`SELECT
      pg_wal_lsn_diff(pg_current_wal_insert_lsn(), checkpoint_lsn)::bigint AS wal_bytes,
      pg_size_bytes(current_setting('max_wal_size'))::bigint AS max_wal_bytes
      FROM pg_control_checkpoint()`);
    const walBytes = Number(result.rows[0].wal_bytes);
    const highWatermark = Number(result.rows[0].max_wal_bytes);
    const resumeWatermark = Math.min(512 * 1024 * 1024, highWatermark / 4);
    if ((!waiting && walBytes < highWatermark) || (waiting && walBytes <= resumeWatermark)) return;
    if (!waiting || checks % 6 === 0)
      console.log(`  ${tableName}: 체크포인트 이후 WAL ${Math.round(walBytes / 1024 / 1024).toLocaleString()} MiB, 자동 체크포인트 대기`);
    waiting = true;
    checks++;
    await delay(5_000);
  }
}

async function migrateCotUtility(client: pg.PoolClient) {
  const existing = await client.query("SELECT id FROM project_sheets WHERE project_id = $1 AND name = $2", [projectId, "COT유틸Total"]);
  if (existing.rowCount) return;
  const project = await client.query<{ document: { sheets?: ProjectDocumentSheet[] } }>("SELECT document FROM projects WHERE id = $1", [projectId]);
  const sheet = project.rows[0]?.document?.sheets?.find((item) => item?.name === "COT유틸Total");
  if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows))
    throw new Error("현재 프로젝트에서 COT유틸Total 시트를 찾지 못했습니다.");
  const columns = sheet.columns.filter((item): item is string => typeof item === "string");
  const columnTypes = Array.isArray(sheet.columnTypes) ? sheet.columnTypes : [];
  const rows = sheet.rows.filter((item): item is unknown[] => Array.isArray(item));
  const sheetId = randomUUID();
  const tableName = physicalTableName(sheetId);
  const physicalColumns = columns.map((name, index) => ({
    name,
    physicalName: physicalColumnName(name, index),
    postgresType: columnTypes[index] === "number" ? "NUMERIC" : columnTypes[index] === "date" ? "DATE" : "TEXT",
  }));
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TABLE project_data.${quoteIdentifier(tableName)} (_row_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, _row_order BIGINT NOT NULL, _data_revision BIGINT NOT NULL DEFAULT 0, ${physicalColumns.map((column) => `${quoteIdentifier(column.physicalName)} ${column.postgresType}`).join(", ")})`);
    await client.query(`INSERT INTO project_sheets (id, project_id, name, physical_table_name, color, comment, display_order, origin, row_count, updated_at) VALUES ($1,$2,$3,$4,$5,$6,0,'manual',$7,NOW())`, [sheetId, projectId, "COT유틸Total", tableName, typeof sheet.color === "string" ? sheet.color : null, typeof sheet.comment === "string" ? sheet.comment : null, rows.length]);
    for (let index = 0; index < physicalColumns.length; index++) {
      const column = physicalColumns[index];
      const colors = sheet.columnColors && typeof sheet.columnColors === "object" ? sheet.columnColors as Record<string, unknown> : {};
      const comments = sheet.columnComments && typeof sheet.columnComments === "object" ? sheet.columnComments as Record<string, unknown> : {};
      await client.query(`INSERT INTO sheet_columns (id, sheet_id, name, physical_column_name, data_type, display_order, color, comment, nullable, primary_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,false)`, [randomUUID(), sheetId, column.name, column.physicalName, column.postgresType, index, typeof colors[column.name] === "string" ? colors[column.name] : null, typeof comments[column.name] === "string" ? comments[column.name] : null]);
    }
    if (rows.length) {
      const names = ["_row_order", ...physicalColumns.map((column) => column.physicalName)];
      for (let index = 0; index < rows.length; index++) {
        const values = [index, ...physicalColumns.map((_, columnIndex) => rows[index][columnIndex] ?? null)];
        await client.query(`INSERT INTO project_data.${quoteIdentifier(tableName)} (${names.map(quoteIdentifier).join(",")}) VALUES (${values.map((_, valueIndex) => `$${valueIndex + 1}`).join(",")})`, values);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function migrateSnapshotRelations(client: pg.PoolClient) {
  const snapshot = await client.query<{ document: { sheets?: ProjectDocumentSheet[]; sheetRelations?: SnapshotRelation[] } }>(
    "SELECT document FROM project_snapshots WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1",
    [projectId],
  );
  const document = snapshot.rows[0]?.document;
  if (!document || !Array.isArray(document.sheets) || !Array.isArray(document.sheetRelations)) return 0;
  const legacyNames = new Map(
    document.sheets
      .filter((sheet) => typeof sheet.id === "string" && typeof sheet.name === "string")
      .map((sheet) => [sheet.id as string, sheet.name as string]),
  );
  let migrated = 0;
  for (const relation of document.sheetRelations) {
    if (
      typeof relation.sourceSheetId !== "string" ||
      typeof relation.sourceColumn !== "string" ||
      typeof relation.targetSheetId !== "string" ||
      typeof relation.targetColumn !== "string" ||
      typeof relation.relationType !== "string"
    ) continue;
    const sourceName = legacyNames.get(relation.sourceSheetId);
    const targetName = legacyNames.get(relation.targetSheetId);
    if (!sourceName || !targetName) continue;
    const columns = await client.query<{ source_sheet_id: string; source_column_id: string; target_sheet_id: string; target_column_id: string }>(`SELECT
      source_sheet.id AS source_sheet_id,
      source_column.id AS source_column_id,
      target_sheet.id AS target_sheet_id,
      target_column.id AS target_column_id
      FROM project_sheets source_sheet
      JOIN sheet_columns source_column ON source_column.sheet_id=source_sheet.id AND source_column.name=$3
      JOIN project_sheets target_sheet ON target_sheet.project_id=source_sheet.project_id AND target_sheet.name=$4
      JOIN sheet_columns target_column ON target_column.sheet_id=target_sheet.id AND target_column.name=$5
      WHERE source_sheet.project_id=$1 AND source_sheet.name=$2
      LIMIT 1`, [projectId, sourceName, relation.sourceColumn, targetName, relation.targetColumn]);
    if (!columns.rowCount) {
      console.warn(`[관계 건너뜀] ${sourceName}.${relation.sourceColumn} -> ${targetName}.${relation.targetColumn}`);
      continue;
    }
    const column = columns.rows[0];
    await client.query(`INSERT INTO sheet_relations
      (id,source_sheet_id,source_column_id,target_sheet_id,target_column_id,relation_type,relation_origin)
      VALUES ($1,$2,$3,$4,$5,$6,'snapshot')
      ON CONFLICT (source_column_id,target_column_id) DO UPDATE SET relation_type=EXCLUDED.relation_type, relation_origin='snapshot'`,
    [randomUUID(), column.source_sheet_id, column.source_column_id, column.target_sheet_id, column.target_column_id, relation.relationType]);
    migrated++;
  }
  console.log(`[관계 완료] ${migrated.toLocaleString()}개`);
  return migrated;
}

async function importBulkRelations(client: pg.PoolClient, path: string) {
  const definitions = parseBulkRelations(readFileSync(resolve(path), "utf8"));
  if (!definitions.length) throw new Error(`${path}: FOREIGN KEY 관계를 찾지 못했습니다.`);

  await client.query(`DELETE FROM sheet_relations relation
    USING project_sheets source_sheet, project_sheets target_sheet
    WHERE relation.source_sheet_id=source_sheet.id
      AND relation.target_sheet_id=target_sheet.id
      AND source_sheet.project_id=$1
      AND (
        relation.relation_origin IN ('bulk-constraint','bulk-constraint-nocheck','inferred','seed')
        OR (relation.relation_origin='snapshot'
          AND source_sheet.name <> 'COT유틸Total'
          AND target_sheet.name <> 'COT유틸Total')
      )`, [projectId]);

  let imported = 0;
  for (const definition of definitions) {
    const columns = await client.query<{
      source_sheet_id: string;
      source_column_id: string;
      target_sheet_id: string;
      target_column_id: string;
    }>(`SELECT source_sheet.id source_sheet_id, source_column.id source_column_id,
        target_sheet.id target_sheet_id, target_column.id target_column_id
      FROM project_sheets source_sheet
      JOIN sheet_columns source_column ON source_column.sheet_id=source_sheet.id AND source_column.name=$3
      JOIN project_sheets target_sheet ON target_sheet.project_id=source_sheet.project_id AND target_sheet.name=$4
      JOIN sheet_columns target_column ON target_column.sheet_id=target_sheet.id AND target_column.name=$5
      WHERE source_sheet.project_id=$1 AND source_sheet.name=$2 LIMIT 1`, [
      projectId, definition.sourceTable, definition.sourceColumn,
      definition.targetTable, definition.targetColumn,
    ]);
    if (!columns.rowCount)
      throw new Error(`관계 대상 누락: ${definition.sourceTable}.${definition.sourceColumn} -> ${definition.targetTable}.${definition.targetColumn}`);
    const column = columns.rows[0];
    const origin = definition.checked ? "bulk-constraint" : "bulk-constraint-nocheck";
    await client.query(`INSERT INTO sheet_relations
      (id,source_sheet_id,source_column_id,target_sheet_id,target_column_id,relation_type,relation_origin)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (source_column_id,target_column_id) DO UPDATE
      SET relation_type=EXCLUDED.relation_type, relation_origin=EXCLUDED.relation_origin`, [
      randomUUID(), column.source_sheet_id, column.source_column_id,
      column.target_sheet_id, column.target_column_id, definition.relationType, origin,
    ]);
    imported++;
  }
  console.log(`[bulk 관계 완료] ${imported.toLocaleString()}개`);
  return imported;
}

async function importTable(client: pg.PoolClient, batchId: string, table: SourceTable, displayOrder: number) {
  const existing = await client.query<{ row_count: string }>("SELECT row_count FROM project_sheets WHERE project_id=$1 AND name=$2 AND seed_batch_id=$3", [projectId, table.name, batchId]);
  if (existing.rowCount) {
    console.log(`[건너뜀] ${table.name}: ${existing.rows[0].row_count}행`);
    return Number(existing.rows[0].row_count);
  }
  const sheetId = randomUUID();
  const tableName = physicalTableName(sheetId);
  let rowOrder = 0;
  let copy: ReturnType<typeof copyFrom> | null = null;
  try {
    // 대형 시트는 파일 단위로 커밋해 한 트랜잭션에 테이블 전체 WAL이 쌓이지 않게 합니다.
    // PK/정렬 인덱스도 COPY 중에는 유지하지 않고 적재 완료 후 한 번만 생성합니다.
    await client.query(`CREATE TABLE project_data.${quoteIdentifier(tableName)} (_row_id BIGINT GENERATED ALWAYS AS IDENTITY, _row_order BIGINT NOT NULL, _data_revision BIGINT NOT NULL DEFAULT 0, ${table.columns.map((column) => `${quoteIdentifier(column.physicalName)} ${column.postgresType}${column.postgresDefault ? ` DEFAULT ${column.postgresDefault}` : ""}${column.nullable ? "" : " NOT NULL"}`).join(", ")})`);
    for (const entry of table.dataEntries) {
      await client.query("BEGIN");
      try {
        let entryColumns = table.columns;
        const child = spawn("unzip", ["-p", zipPath, entry], { stdio: ["ignore", "pipe", "pipe"] });
        const childClosed = once(child, "close") as Promise<[number | null]>;
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        for await (const line of readLines(child.stdout)) {
          const trimmed = line.trimStart();
          const insertColumns = trimmed.match(/^INSERT\s+INTO\s+.+?\s*\(([^)]+)\)\s+VALUES/i);
          if (insertColumns) {
            const names = [...insertColumns[1].matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
            entryColumns = names.map((name) => {
              const column = table.columns.find((candidate) => candidate.name === name);
              if (!column) throw new Error(`${entry}: INSERT 컬럼 ${name}을 DDL에서 찾지 못했습니다.`);
              return column;
            });
            continue;
          }
          if (!trimmed.startsWith("(")) continue;
          if (!copy) {
            const copyColumns = ["_row_order", ...entryColumns.map((column) => column.physicalName)];
            copy = client.query(copyFrom(`COPY project_data.${quoteIdentifier(tableName)} (${copyColumns.map(quoteIdentifier).join(",")}) FROM STDIN WITH (FORMAT text)`));
            copy.on("error", () => {
              // 오류는 아래 await/catch 경로에서 배치 오류로 기록합니다.
            });
          }
          const values = parseSqlServerValues(trimmed);
          if (values.length !== entryColumns.length) throw new Error(`${entry} ${rowOrder + 1}행: ${values.length}개 값, INSERT ${entryColumns.length}개 컬럼`);
          rowOrder++;
          const copyLine = [String(rowOrder - 1), ...values.map((value, index) => copyValue(value, entryColumns[index]))].join("\t") + "\n";
          if (!copy.write(copyLine)) await once(copy, "drain");
          if (maxRows > 0 && rowOrder >= maxRows) break;
          if (rowOrder % 50_000 === 0) console.log(`  ${table.name}: ${rowOrder.toLocaleString()}행`);
        }
        if (maxRows > 0 && rowOrder >= maxRows) child.kill();
        const [exitCode] = await childClosed;
        if (exitCode && !(maxRows > 0 && rowOrder >= maxRows)) throw new Error(`${entry}: unzip 실패(${exitCode}) ${stderr}`);
        if (copy) {
          copy.end();
          await once(copy, "finish");
          copy = null;
        }
        await client.query("COMMIT");
        await waitForWalHeadroom(client, table.name);
      } catch (error) {
        try { copy?.destroy(error instanceof Error ? error : new Error(String(error))); } catch { /* 이미 종료됨 */ }
        copy = null;
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      if (maxRows > 0 && rowOrder >= maxRows) break;
    }
    await client.query("BEGIN");
    await client.query(`ALTER TABLE project_data.${quoteIdentifier(tableName)} ADD PRIMARY KEY (_row_id)`);
    const primary = table.columns.filter((column) => column.primaryKey);
    if (primary.length)
      await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${tableName}_source_pk`)} ON project_data.${quoteIdentifier(tableName)} (${primary.map((column) => quoteIdentifier(column.physicalName)).join(",")})`);
    await client.query(`CREATE UNIQUE INDEX ${quoteIdentifier(`${tableName}_row_order`)} ON project_data.${quoteIdentifier(tableName)} (_row_order)`);
    await client.query(`INSERT INTO project_sheets (id, project_id, name, physical_table_name, display_order, origin, seed_batch_id, row_count, updated_at) VALUES ($1,$2,$3,$4,$5,'seed',$6,$7,NOW())`, [sheetId, projectId, table.name, tableName, displayOrder, batchId, rowOrder]);
    for (let index = 0; index < table.columns.length; index++) {
      const column = table.columns[index];
      await client.query(`INSERT INTO sheet_columns (id, sheet_id, name, physical_column_name, data_type, display_order, nullable, primary_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), sheetId, column.name, column.physicalName, column.postgresType, index, column.nullable, column.primaryKey]);
    }
    await client.query("COMMIT");
    console.log(`[완료] ${table.name}: ${rowOrder.toLocaleString()}행`);
    return rowOrder;
  } catch (error) {
    console.error(`[실패] ${table.name} ${rowOrder.toLocaleString()}행:`, error);
    await client.query("ROLLBACK").catch(() => undefined);
    // 메타데이터 등록 전 실패한 임시 물리 테이블이 다음 재시도의 공간을 차지하지 않게 정리합니다.
    await client.query(`DROP TABLE IF EXISTS project_data.${quoteIdentifier(tableName)}`).catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (!zipPath) throw new Error("사용법: npm run db:seed:lca -- <zip> --execute [--project=demo]");
  const tables = discoverTables();
  const selectedTables = maxTables > 0 ? tables.slice(0, maxTables) : tables;
  console.log(JSON.stringify({ zip: basename(zipPath), projectId, execute, tables: tables.length, selectedTables: selectedTables.length, maxRows: maxRows || null }));
  if (!execute) {
    console.log(selectedTables.map((table) => `${table.order}\t${table.name}\t${table.columns.length}컬럼\t${table.dataEntries.length}파일`).join("\n"));
    return;
  }
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 30_000 });
  const client = await pool.connect();
  const hash = await sourceHash();
  let batchId = "";
  try {
    await migrateCotUtility(client);
    const batch = await client.query<{ id: string }>(`INSERT INTO seed_batches (id, project_id, source_filename, source_hash, status, started_at) VALUES ($1,$2,$3,$4,'running',NOW()) ON CONFLICT (project_id, source_hash) DO UPDATE SET status='running', started_at=COALESCE(seed_batches.started_at,NOW()) RETURNING id`, [randomUUID(), projectId, basename(zipPath), hash]);
    batchId = batch.rows[0].id;
    let importedRows = 0;
    for (let index = 0; index < selectedTables.length; index++) {
      const table = selectedTables[index];
      try {
        importedRows += await importTable(client, batchId, table, index + 1);
        await client.query("DELETE FROM seed_errors WHERE seed_batch_id=$1 AND source_table=$2", [batchId, table.name]);
        await client.query("UPDATE seed_batches SET imported_rows=$1 WHERE id=$2", [importedRows, batchId]);
      } catch (error) {
        await client.query(`INSERT INTO seed_errors (id, seed_batch_id, source_table, error_code, error_message) VALUES ($1,$2,$3,'IMPORT_FAILED',$4)`, [randomUUID(), batchId, table.name, error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000)]);
        await client.query("UPDATE seed_batches SET status='failed', failed_rows=failed_rows+1 WHERE id=$1", [batchId]);
        throw error;
      }
    }
    await migrateSnapshotRelations(client);
    if (constraintsPath) await importBulkRelations(client, constraintsPath);
    await client.query("UPDATE seed_batches SET status='completed', failed_rows=(SELECT COUNT(*) FROM seed_errors WHERE seed_batch_id=$1), completed_at=NOW() WHERE id=$1", [batchId]);
    console.log(JSON.stringify({ batchId, status: "completed", importedRows }));
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  void main().catch(async (error) => {
    console.error(error);
    if (connectionString) {
      const client = new pg.Client({ connectionString });
      try {
        await client.connect();
        await client.query("UPDATE seed_batches SET status='failed' WHERE project_id=$1 AND status='running'", [projectId]);
      } catch { /* 원래 오류를 유지합니다. */ } finally { await client.end().catch(() => undefined); }
    }
    process.exitCode = 1;
  });
