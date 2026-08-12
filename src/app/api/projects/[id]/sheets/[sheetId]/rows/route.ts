import { prisma } from "@/lib/prisma";
import { postgres, quoteRegisteredIdentifier } from "@/lib/postgres";
import { requestHasProjectAccess } from "@/lib/project-security";

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]/rows">,
) {
  const { id, sheetId } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { passwordHash: true },
  });
  if (!project) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!requestHasProjectAccess(request, id, project.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const sheet = await prisma.projectSheet.findFirst({
    where: { id: sheetId, projectId: id },
    include: { columns: { orderBy: { displayOrder: "asc" } } },
  });
  if (!sheet) return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isInteger(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 100;
  const cursorValue = url.searchParams.get("cursor");
  const cursor = cursorValue && /^\d+$/.test(cursorValue) ? BigInt(cursorValue) : BigInt(-1);
  const tableName = quoteRegisteredIdentifier(sheet.physicalTableName);
  const columnNames = sheet.columns.map((column) => quoteRegisteredIdentifier(column.physicalColumnName));
  const result = await postgres.query<Record<string, unknown>>(
    `SELECT _row_id::text, _row_order::text, ${columnNames.join(", ")} FROM project_data.${tableName} WHERE _row_order > $1 ORDER BY _row_order ASC LIMIT $2`,
    [cursor.toString(), limit],
  );
  const rows = result.rows.map((row) => ({
    id: String(row._row_id),
    order: Number(row._row_order),
    values: sheet.columns.map((column) => {
      const value = row[column.physicalColumnName];
      if (value === null || value === undefined) return "";
      if (value instanceof Date) return value.toISOString();
      return String(value);
    }),
  }));
  return Response.json(
    {
      sheet: { id: sheet.id, name: sheet.name, rowCount: Number(sheet.rowCount) },
      rows,
      nextCursor: rows.length === limit ? String(rows.at(-1)?.order) : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
