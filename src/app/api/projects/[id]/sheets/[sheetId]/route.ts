import { prisma } from "@/lib/prisma";
import { requestHasProjectWriteAccess } from "@/lib/auth";
import { quoteRegisteredIdentifier } from "@/lib/postgres";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]">,
) {
  const { id, sheetId } = await context.params;
  const sheet = await prisma.projectSheet.findFirst({
    where: { id: sheetId, projectId: id, project: { deletedAt: null } },
    select: {
      id: true,
      physicalTableName: true,
      project: { select: { passwordHash: true, ownerId: true } },
    },
  });
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

  const deleted = await prisma.$transaction(async (transaction) => {
    const result = await transaction.projectSheet.deleteMany({
      where: { id: sheetId, projectId: id },
    });
    if (result.count !== 1) return false;
    await transaction.$executeRawUnsafe(
      `DROP TABLE IF EXISTS project_data.${quoteRegisteredIdentifier(sheet.physicalTableName)}`,
    );
    return true;
  });
  if (!deleted)
    return Response.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });

  return Response.json({ ok: true });
}
