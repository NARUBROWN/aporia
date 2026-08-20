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

export async function POST(
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

  const tableName = quoteRegisteredIdentifier(sheet.physicalTableName);
  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    const lockedSheet = await client.query(
      `SELECT id FROM project_sheets
        WHERE id = $1::uuid AND project_id = $2
        FOR UPDATE`,
      [sheet.id, id],
    );
    if (lockedSheet.rowCount !== 1) {
      await client.query("ROLLBACK");
      return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
    }
    const rowIdDefinition = await client.query<{
      is_identity: "YES" | "NO";
      column_default: string | null;
    }>(
      `SELECT is_identity, column_default
         FROM information_schema.columns
        WHERE table_schema = 'project_data'
          AND table_name = $1
          AND column_name = '_row_id'`,
      [sheet.physicalTableName],
    );
    const databaseGeneratesRowId =
      rowIdDefinition.rows[0]?.is_identity === "YES" ||
      typeof rowIdDefinition.rows[0]?.column_default === "string";
    const inserted = await client.query<{ row_id: string; row_order: string }>(
      databaseGeneratesRowId
        ? `INSERT INTO project_data.${tableName} (_row_order)
           SELECT COALESCE(MAX(_row_order), -1) + 1
             FROM project_data.${tableName}
           RETURNING _row_id::text AS row_id, _row_order::text AS row_order`
        : `INSERT INTO project_data.${tableName} (_row_id, _row_order)
           SELECT
             COALESCE(MAX(_row_id), 0) + 1,
             COALESCE(MAX(_row_order), -1) + 1
             FROM project_data.${tableName}
           RETURNING _row_id::text AS row_id, _row_order::text AS row_order`,
    );
    const metadata = await client.query<{ row_count: string }>(
      `UPDATE project_sheets
          SET row_count = (SELECT COUNT(*) FROM project_data.${tableName}),
              data_revision = data_revision + 1,
              updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING row_count::text`,
      [sheet.id],
    );
    await client.query("COMMIT");
    return Response.json(
      {
        row: {
          id: inserted.rows[0].row_id,
          order: Number(inserted.rows[0].row_order),
          values: sheet.columns.map(() => ""),
        },
        rowCount: Number(metadata.rows[0].row_count),
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export async function DELETE(
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

  const body = (await request.json().catch(() => null)) as {
    rowId?: unknown;
  } | null;
  if (typeof body?.rowId !== "string" || !/^[1-9]\d*$/.test(body.rowId))
    return Response.json({ error: "INVALID_ROW_DELETE" }, { status: 400 });

  const tableName = quoteRegisteredIdentifier(sheet.physicalTableName);
  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    const lockedSheet = await client.query(
      `SELECT id FROM project_sheets
        WHERE id = $1::uuid AND project_id = $2
        FOR UPDATE`,
      [sheet.id, id],
    );
    if (lockedSheet.rowCount !== 1) {
      await client.query("ROLLBACK");
      return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
    }
    const deleted = await client.query<{ row_id: string }>(
      `DELETE FROM project_data.${tableName}
        WHERE _row_id = $1::bigint
        RETURNING _row_id::text AS row_id`,
      [body.rowId],
    );
    if (deleted.rowCount !== 1) {
      await client.query("ROLLBACK");
      return Response.json({ error: "ROW_NOT_FOUND" }, { status: 404 });
    }
    const metadata = await client.query<{ row_count: string }>(
      `UPDATE project_sheets
          SET row_count = (SELECT COUNT(*) FROM project_data.${tableName}),
              data_revision = data_revision + 1,
              updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING row_count::text`,
      [sheet.id],
    );
    await client.query("COMMIT");
    return Response.json({
      rowId: deleted.rows[0].row_id,
      rowCount: Number(metadata.rows[0].row_count),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
