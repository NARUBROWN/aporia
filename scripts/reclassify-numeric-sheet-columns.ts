import "dotenv/config";

import { createHash } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DIRECT_URL 또는 DATABASE_URL이 필요합니다.");

const args = process.argv.slice(2);
const projectId =
  args.find((argument) => argument.startsWith("--project="))?.split("=")[1] ??
  process.env.APORIA_PROJECT_ID ??
  "";
const execute = args.includes("--execute");
const numericPattern = "^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$";

type RegisteredColumn = {
  id: string;
  sheet_name: string;
  physical_table_name: string;
  name: string;
  physical_column_name: string;
  data_type: string;
};

function quoteRegisteredIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error(`등록되지 않은 물리 식별자입니다: ${value}`);
  return `"${value}"`;
}

function metadataHash(columns: RegisteredColumn[]) {
  return createHash("sha256")
    .update(
      columns
        .map((column) =>
          [column.id, column.sheet_name, column.name, column.data_type].join("\t"),
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");
}

async function main() {
  if (!projectId)
    throw new Error("--project=<UUID> 또는 APORIA_PROJECT_ID가 필요합니다.");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<RegisteredColumn>(
      `SELECT column_row.id::text,
              sheet.name AS sheet_name,
              sheet.physical_table_name,
              column_row.name,
              column_row.physical_column_name,
              column_row.data_type
         FROM project_sheets sheet
         JOIN sheet_columns column_row ON column_row.sheet_id = sheet.id
        WHERE sheet.project_id = $1
        ORDER BY sheet.display_order, column_row.display_order`,
      [projectId],
    );
    const columns = result.rows;
    const textColumns = columns.filter((column) =>
      /char|text|string/i.test(column.data_type),
    );
    const candidates: RegisteredColumn[] = [];
    let scannedRows = 0;
    const byTable = new Map<string, RegisteredColumn[]>();
    textColumns.forEach((column) => {
      const current = byTable.get(column.physical_table_name) ?? [];
      current.push(column);
      byTable.set(column.physical_table_name, current);
    });

    for (const [tableName, tableColumns] of byTable) {
      const expressions = tableColumns.flatMap((column, index) => {
        const identifier = quoteRegisteredIdentifier(column.physical_column_name);
        return [
          `COUNT(*) FILTER (WHERE NULLIF(BTRIM(${identifier}::text), '') IS NOT NULL)::int AS "count_${index}"`,
          `COALESCE(BOOL_AND(BTRIM(${identifier}::text) ~ $1) FILTER (WHERE NULLIF(BTRIM(${identifier}::text), '') IS NOT NULL), false) AS "numeric_${index}"`,
        ];
      });
      const audit = await client.query<Record<string, number | boolean>>(
        `SELECT COUNT(*)::int AS row_count, ${expressions.join(", ")}
           FROM project_data.${quoteRegisteredIdentifier(tableName)}`,
        [numericPattern],
      );
      scannedRows += Number(audit.rows[0].row_count ?? 0);
      tableColumns.forEach((column, index) => {
        if (
          Number(audit.rows[0][`count_${index}`] ?? 0) > 0 &&
          audit.rows[0][`numeric_${index}`] === true
        )
          candidates.push(column);
      });
    }

    const beforeHash = metadataHash(columns);
    if (execute && candidates.length > 0) {
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE sheet_columns
              SET data_type = 'NUMERIC'
            WHERE id = ANY($1::uuid[])`,
          [candidates.map((column) => column.id)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const changedIds = new Set(candidates.map((column) => column.id));
    const afterColumns = columns.map((column) =>
      execute && changedIds.has(column.id)
        ? { ...column, data_type: "NUMERIC" }
        : column,
    );
    console.log(
      JSON.stringify(
        {
          projectId,
          mode: execute ? "execute" : "dry-run",
          sheets: new Set(columns.map((column) => column.physical_table_name)).size,
          columns: columns.length,
          textColumns: textColumns.length,
          scannedRows,
          numericCandidates: candidates.length,
          beforeMetadataHash: beforeHash,
          afterMetadataHash: metadataHash(afterColumns),
          changes: candidates.map((column) => ({
            sheet: column.sheet_name,
            column: column.name,
            from: column.data_type,
            to: "NUMERIC",
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
