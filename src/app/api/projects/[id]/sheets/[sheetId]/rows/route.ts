import { prisma } from "@/lib/prisma";
import { postgres, quoteRegisteredIdentifier } from "@/lib/postgres";
import { requestHasOwnedProjectAccess, requestHasProjectWriteAccess } from "@/lib/auth";
import {
  normalizeStoredColumnType,
  validateSheetValue,
} from "@/lib/sheet-value-validation";

function findSheetWithAccess(projectId: string, sheetId: string) {
  return prisma.projectSheet.findFirst({
    where: { id: sheetId, projectId, project: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      physicalTableName: true,
      rowCount: true,
      project: { select: { passwordHash: true, ownerId: true } },
      columns: {
        orderBy: { displayOrder: "asc" as const },
        select: {
          physicalColumnName: true,
          dataType: true,
        },
      },
    },
  });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]/rows">,
) {
  const { id, sheetId } = await context.params;
  const sheet = await findSheetWithAccess(id, sheetId);
  if (!sheet) return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
  if (
    !(await requestHasOwnedProjectAccess(
      request,
      id,
      sheet.project.ownerId,
      sheet.project.passwordHash,
    ))
  )
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

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
      if (normalizeStoredColumnType(column.dataType) === "boolean")
        return value === true || value === "true" ? "예" : "아니오";
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

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]/rows">,
) {
  const { id, sheetId } = await context.params;
  const sheet = await findSheetWithAccess(id, sheetId);
  if (!sheet)
    return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
  if (
    !(await requestHasProjectWriteAccess(
      request,
      id,
      sheet.project.ownerId,
      sheet.project.passwordHash,
    ))
  )
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const body = (await request.json()) as {
    rowId?: unknown;
    columnIndex?: unknown;
    value?: unknown;
    changes?: Array<{
      rowId?: unknown;
      columnIndex?: unknown;
      value?: unknown;
    }>;
  };
  const requestedChanges = Array.isArray(body.changes)
    ? body.changes
    : [{ rowId: body.rowId, columnIndex: body.columnIndex, value: body.value }];
  if (requestedChanges.length === 0 || requestedChanges.length > 200)
    return Response.json({ error: "INVALID_ROW_UPDATE" }, { status: 400 });

  const changes = [] as Array<{
    rowId: string;
    columnIndex: number;
    value: string;
    storedValue: string | boolean | null;
    physicalColumnName: string;
  }>;
  for (const change of requestedChanges) {
    if (
      typeof change.rowId !== "string" ||
      !/^[1-9]\d*$/.test(change.rowId) ||
      !Number.isInteger(change.columnIndex) ||
      typeof change.value !== "string"
    )
      return Response.json({ error: "INVALID_ROW_UPDATE" }, { status: 400 });
    const columnIndex = change.columnIndex as number;
    const column = sheet.columns[columnIndex];
    if (!column)
      return Response.json({ error: "COLUMN_NOT_FOUND" }, { status: 404 });
    const type = normalizeStoredColumnType(column.dataType);
    const validation = validateSheetValue(type, change.value);
    if (!validation.valid)
      return Response.json(
        { error: "INVALID_VALUE", message: validation.message },
        { status: 422 },
      );
    changes.push({
      rowId: change.rowId,
      columnIndex,
      value: validation.value,
      storedValue:
        validation.value === ""
          ? null
          : type === "boolean"
            ? validation.value === "예"
            : validation.value,
      physicalColumnName: column.physicalColumnName,
    });
  }

  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    for (const change of changes) {
      const result = await client.query<{ row_id: string }>(
        `UPDATE project_data.${quoteRegisteredIdentifier(sheet.physicalTableName)}
            SET ${quoteRegisteredIdentifier(change.physicalColumnName)} = $1
          WHERE _row_id = $2::bigint
          RETURNING _row_id::text AS row_id`,
        [change.storedValue, change.rowId],
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return Response.json({ error: "ROW_NOT_FOUND" }, { status: 404 });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await prisma.projectSheet.update({
    where: { id: sheet.id },
    data: { dataRevision: { increment: 1 } },
  });
  return Response.json({
    changes: changes.map(({ rowId, columnIndex, value }) => ({
      rowId,
      columnIndex,
      value,
    })),
  });
}
