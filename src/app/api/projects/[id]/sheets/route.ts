import { prisma } from "@/lib/prisma";
import { requestHasOwnedProjectAccess } from "@/lib/auth";

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets">,
) {
  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, passwordHash: true, ownerId: true },
  });
  if (!project) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasOwnedProjectAccess(request, id, project.ownerId, project.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const sheets = await prisma.projectSheet.findMany({
    where: { projectId: id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: { columns: { orderBy: { displayOrder: "asc" } } },
  });
  const latestBatch = await prisma.seedBatch.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, importedRows: true, failedRows: true },
  });
  const relations = await prisma.sheetRelation.findMany({
    where: { sourceSheet: { projectId: id } },
    orderBy: { createdAt: "asc" },
    include: {
      sourceColumn: { select: { name: true } },
      targetColumn: { select: { name: true } },
    },
  });
  return Response.json(
    {
      seedBatch: latestBatch
        ? {
            id: latestBatch.id,
            status: latestBatch.status,
            importedRows: Number(latestBatch.importedRows),
            failedRows: Number(latestBatch.failedRows),
          }
        : null,
      sheets: sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        color: sheet.color,
        comment: sheet.comment,
        displayOrder: sheet.displayOrder,
        origin: sheet.origin,
        rowCount: Number(sheet.rowCount),
        dataRevision: Number(sheet.dataRevision),
        columns: sheet.columns.map((column) => ({
          id: column.id,
          name: column.name,
          dataType: column.dataType,
          displayOrder: column.displayOrder,
          color: column.color,
          comment: column.comment,
          nullable: column.nullable,
          primaryKey: column.primaryKey,
        })),
      })),
      relations: relations.map((relation) => ({
        id: relation.id,
        sourceSheetId: relation.sourceSheetId,
        sourceColumn: relation.sourceColumn.name,
        targetSheetId: relation.targetSheetId,
        targetColumn: relation.targetColumn.name,
        relationType: relation.relationType,
        relationOrigin: relation.relationOrigin,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
