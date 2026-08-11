import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requestHasProjectAccess } from "@/lib/project-security";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/snapshots/[snapshotId]">,
) {
  const { id, snapshotId } = await context.params;
  const existing = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true } });
  if (!existing) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!requestHasProjectAccess(request, id, existing.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const result = await prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) return { error: "PROJECT_NOT_FOUND" as const };
    const selected = await transaction.projectSnapshot.findFirst({
      where: { id: snapshotId, projectId: id },
    });
    if (!selected) return { error: "SNAPSHOT_NOT_FOUND" as const };

    await transaction.projectSnapshot.create({
      data: {
        id: crypto.randomUUID(),
        projectId: id,
        document: project.document as Prisma.InputJsonValue,
        projectVersion: project.version,
        reason: "before_restore",
      },
    });
    const restored = await transaction.project.update({
      where: { id },
      data: {
        document: selected.document as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return { project: restored };
  });

  if ("error" in result)
    return Response.json({ error: result.error }, { status: 404 });

  return Response.json({
    project: {
      id: result.project.id,
      document: result.project.document,
      version: Number(result.project.version),
      updatedAt: result.project.updatedAt.toISOString(),
    },
  });
}
