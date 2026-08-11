import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/projects/[id]/snapshots/[snapshotId]">,
) {
  const { id, snapshotId } = await context.params;

  const result = await prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findUnique({ where: { id } });
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
