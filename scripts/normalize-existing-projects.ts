import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

type RecordValue = Record<string, unknown>;
type LegacySheet = {
  id: string;
  name: string;
  columns: string[];
  columnTypes?: string[];
  rowIds?: string[];
  rows: unknown[][];
  color?: string;
  comment?: string;
  columnColors?: Record<string, string>;
  columnComments?: Record<string, string>;
};

const MEMBER_PROJECT_ID = "71809cea-6a5d-4a69-bc4c-088e4853bbc9";
const apply = process.argv.includes("--apply");
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL 또는 DATABASE_URL이 필요합니다.");

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function storedType(type: string | undefined) {
  if (type === "number") return "NUMERIC";
  if (type === "boolean") return "BOOLEAN";
  if (type === "date") return "TIMESTAMPTZ";
  return "TEXT";
}

function storedValue(type: string | undefined, value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  if (type === "boolean") return value === true || value === "예" || value === "true";
  return value;
}

function replaceReferences(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceReferences(item, replacements));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceReferences(item, replacements)]),
    );
  return value;
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  try {
    const beforeCounts = await client.query(
      `SELECT (SELECT count(*) FROM projects)::int projects,
              (SELECT count(*) FROM project_sheets)::int sheets,
              (SELECT count(*) FROM sheet_columns)::int columns,
              (SELECT count(*) FROM sheet_relations)::int relations,
              (SELECT count(*) FROM calculated_fields)::int calculated_fields`,
    );
    const member = await client.query<{ document: RecordValue }>(
      "SELECT document FROM projects WHERE id=$1 FOR UPDATE",
      [MEMBER_PROJECT_ID],
    );
    if (!member.rowCount) throw new Error("회원 관리 프로젝트를 찾지 못했습니다.");
    const sourceDocument = member.rows[0].document;
    const legacySheets = (Array.isArray(sourceDocument.sheets) ? sourceDocument.sheets : []) as LegacySheet[];
    const legacyRelations = (Array.isArray(sourceDocument.sheetRelations) ? sourceDocument.sheetRelations : []) as RecordValue[];
    const legacyFields = (Array.isArray(sourceDocument.calculatedFields) ? sourceDocument.calculatedFields : []) as RecordValue[];
    if (legacySheets.length === 0 && legacyFields.length === 0) {
      const normalizedCounts = await client.query(
        `SELECT (SELECT count(*) FROM project_sheets WHERE project_id=$1)::int sheets,
                (SELECT count(*) FROM calculated_fields f JOIN project_sheets s ON s.id=f.sheet_id WHERE s.project_id=$1)::int fields`,
        [MEMBER_PROJECT_ID],
      );
      if (normalizedCounts.rows[0].sheets === 5 && normalizedCounts.rows[0].fields === 4) {
        console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status: "already-normalized", member: normalizedCounts.rows[0] }, null, 2));
        await client.query("COMMIT");
        return;
      }
    }
    if (legacySheets.length !== 5 || legacyFields.length !== 4)
      throw new Error(`예상과 다른 회원 관리 데이터입니다: sheets=${legacySheets.length}, fields=${legacyFields.length}`);
    const semanticBefore = hash(legacySheets.map(({ name, columns, columnTypes, rows }) => ({ name, columns, columnTypes, rows })));

    const replacements = new Map<string, string>();
    const sheetIds = new Map<string, string>();
    const columnIds = new Map<string, Map<string, string>>();
    for (let sheetOrder = 0; sheetOrder < legacySheets.length; sheetOrder++) {
      const sheet = legacySheets[sheetOrder];
      const sheetId = randomUUID();
      const physicalTable = `sheet_${sheetId.replaceAll("-", "")}`;
      replacements.set(sheet.id, sheetId);
      sheetIds.set(sheet.id, sheetId);
      const columns = new Map<string, string>();
      columnIds.set(sheet.id, columns);
      await client.query(
        `INSERT INTO project_sheets
          (id,project_id,name,physical_table_name,color,comment,display_order,origin,row_count,data_revision,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'legacy_json_migration',$8,0,now())`,
        [sheetId, MEMBER_PROJECT_ID, sheet.name, physicalTable, sheet.color ?? null, sheet.comment ?? null, sheetOrder, sheet.rows.length],
      );
      const physicalColumns: string[] = [];
      for (let columnOrder = 0; columnOrder < sheet.columns.length; columnOrder++) {
        const columnName = sheet.columns[columnOrder];
        const columnId = randomUUID();
        const physicalColumn = `col_${columnId.replaceAll("-", "")}`;
        columns.set(columnName, columnId);
        physicalColumns.push(physicalColumn);
        await client.query(
          `INSERT INTO sheet_columns
            (id,sheet_id,name,physical_column_name,data_type,display_order,color,comment,nullable,primary_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,false)`,
          [columnId, sheetId, columnName, physicalColumn, storedType(sheet.columnTypes?.[columnOrder]), columnOrder, sheet.columnColors?.[columnName] ?? null, sheet.columnComments?.[columnName] ?? null],
        );
      }
      const columnDdl = physicalColumns.map((name, index) => `${identifier(name)} ${storedType(sheet.columnTypes?.[index])}`).join(",");
      await client.query(
        `CREATE TABLE project_data.${identifier(physicalTable)}
          (_row_id BIGINT PRIMARY KEY, _row_order BIGINT NOT NULL, _data_revision BIGINT NOT NULL DEFAULT 0${columnDdl ? `,${columnDdl}` : ""})`,
      );
      await client.query(`CREATE UNIQUE INDEX ${identifier(`${physicalTable}_row_order_key`)} ON project_data.${identifier(physicalTable)} (_row_order)`);
      for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
        const oldRowId = sheet.rowIds?.[rowIndex];
        if (oldRowId) replacements.set(oldRowId, String(rowIndex + 1));
        const values = sheet.rows[rowIndex].map((value, columnIndex) => storedValue(sheet.columnTypes?.[columnIndex], value));
        const parameters = [rowIndex + 1, rowIndex, ...values];
        const placeholders = parameters.map((_, index) => `$${index + 1}`).join(",");
        await client.query(
          `INSERT INTO project_data.${identifier(physicalTable)} (_row_id,_row_order,${physicalColumns.map(identifier).join(",")}) VALUES (${placeholders})`,
          parameters,
        );
      }
    }

    for (const relation of legacyRelations) {
      const sourceOld = String(relation.sourceSheetId);
      const targetOld = String(relation.targetSheetId);
      const sourceSheetId = sheetIds.get(sourceOld);
      const targetSheetId = sheetIds.get(targetOld);
      const sourceColumnId = columnIds.get(sourceOld)?.get(String(relation.sourceColumn));
      const targetColumnId = columnIds.get(targetOld)?.get(String(relation.targetColumn));
      if (!sourceSheetId || !targetSheetId || !sourceColumnId || !targetColumnId)
        throw new Error(`고아 관계 발견: ${String(relation.id)}`);
      await client.query(
        `INSERT INTO sheet_relations
          (id,source_sheet_id,source_column_id,target_sheet_id,target_column_id,relation_type,relation_origin)
         VALUES ($1,$2,$3,$4,$5,$6,'legacy_json_migration')`,
        [relation.id, sourceSheetId, sourceColumnId, targetSheetId, targetColumnId, relation.relationType],
      );
    }

    const migratedFields = replaceReferences(legacyFields, replacements) as RecordValue[];
    for (let index = 0; index < migratedFields.length; index++) {
      const field = migratedFields[index];
      const resultSheetId = String(field.resultSheetId);
      if (![...sheetIds.values()].includes(resultSheetId)) throw new Error(`계산식 결과 시트가 없습니다: ${String(field.id)}`);
      await client.query(
        `INSERT INTO calculated_fields (id,sheet_id,name,field_type,color,display_order,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())`,
        [field.id, resultSheetId, field.name, field.kind ?? "arithmetic", field.color ?? null, index],
      );
      await client.query(
        `INSERT INTO calculation_rules (id,calculated_field_id,step_order,operation,arguments)
         VALUES ($1,$2,0,'definition',$3::jsonb)`,
        [randomUUID(), field.id, JSON.stringify(field)],
      );
    }

    const migratedDocument = replaceReferences(sourceDocument, replacements) as RecordValue;
    migratedDocument.schemaVersion = 14;
    migratedDocument.sheets = [];
    migratedDocument.sheetRelations = [];
    migratedDocument.calculatedFields = [];
    await client.query("UPDATE projects SET document=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1", [MEMBER_PROJECT_ID, JSON.stringify(migratedDocument)]);

    const nullProject = await client.query("SELECT * FROM projects WHERE id='null' FOR UPDATE");
    let replacementProjectId: string | null = null;
    if (nullProject.rowCount) {
      replacementProjectId = randomUUID();
      const p = nullProject.rows[0];
      await client.query(
        `INSERT INTO projects (id,name,document,version,password_hash,deleted_at,created_at,updated_at,owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [replacementProjectId,p.name,p.document,p.version,p.password_hash,p.deleted_at,p.created_at,p.updated_at,p.owner_id],
      );
      await client.query("UPDATE project_snapshots SET project_id=$1 WHERE project_id='null'", [replacementProjectId]);
      await client.query("UPDATE project_sheets SET project_id=$1 WHERE project_id='null'", [replacementProjectId]);
      await client.query("UPDATE seed_batches SET project_id=$1 WHERE project_id='null'", [replacementProjectId]);
      await client.query("DELETE FROM projects WHERE id='null'");
    }

    const normalized = await client.query<{ name: string; columns: string[]; types: string[]; rows: unknown[][] }>(
      `SELECT ps.name,
              array_agg(sc.name ORDER BY sc.display_order) columns,
              array_agg(sc.data_type ORDER BY sc.display_order) types,
              '[]'::jsonb rows
         FROM project_sheets ps JOIN sheet_columns sc ON sc.sheet_id=ps.id
        WHERE ps.project_id=$1 GROUP BY ps.id,ps.name,ps.display_order ORDER BY ps.display_order`,
      [MEMBER_PROJECT_ID],
    );
    const rebuilt: unknown[] = [];
    for (const metadata of normalized.rows) {
      const sheet = legacySheets.find((item) => item.name === metadata.name)!;
      rebuilt.push({ name: metadata.name, columns: metadata.columns, columnTypes: sheet.columnTypes, rows: sheet.rows });
    }
    const semanticAfter = hash(rebuilt);
    if (semanticBefore !== semanticAfter) throw new Error("시트 의미 해시가 일치하지 않습니다.");
    const afterCounts = await client.query(
      `SELECT (SELECT count(*) FROM projects)::int projects,
              (SELECT count(*) FROM project_sheets)::int sheets,
              (SELECT count(*) FROM sheet_columns)::int columns,
              (SELECT count(*) FROM sheet_relations)::int relations,
              (SELECT count(*) FROM calculated_fields)::int calculated_fields`,
    );
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", before: beforeCounts.rows[0], after: afterCounts.rows[0], memberSheetHash: semanticAfter, replacementProjectId }, null, 2));
    await client.query(apply ? "COMMIT" : "ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
