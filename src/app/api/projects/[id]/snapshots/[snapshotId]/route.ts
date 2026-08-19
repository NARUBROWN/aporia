import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requestHasProjectWriteAccess } from "@/lib/auth";
import { migrateProjectDocument } from "@/lib/project-document-migration";
import {
  NormalizedDefinitionError,
  syncDocumentSheets,
  syncNormalizedDefinitions,
  withoutNormalizedDefinitions,
} from "@/lib/normalized-definitions";
import {
  alignSnapshotDocumentToProject,
  hydrateNormalizedSnapshot,
  snapshotNormalizedProject,
} from "@/lib/normalized-snapshots";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/snapshots/[snapshotId]">,
) {
  const { id, snapshotId } = await context.params;
  const existing = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true, ownerId: true } });
  if (!existing) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasProjectWriteAccess(request, id, existing.ownerId, existing.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { baseVersion?: unknown };
  const baseVersion = typeof body.baseVersion === "number" ? body.baseVersion : undefined;
  if (
    "baseVersion" in body &&
    (!Number.isSafeInteger(baseVersion) || (baseVersion ?? 0) < 1)
  )
    return Response.json({ error: "INVALID_BASE_VERSION" }, { status: 400 });

  let result;
  try {
    result = await prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(baseVersion === undefined ? {} : { version: BigInt(baseVersion) }),
        },
      });
      if (!project) return { error: "PROJECT_VERSION_CONFLICT" as const };
      const selected = await transaction.projectSnapshot.findFirst({
        where: { id: snapshotId, projectId: id },
      });
      if (!selected) return { error: "SNAPSHOT_NOT_FOUND" as const };
      const storedDocument = migrateProjectDocument(selected.document);
      if (!storedDocument) return { error: "INVALID_SNAPSHOT" as const };
      const beforeRestore = await transaction.projectSnapshot.create({
        data: {
          id: crypto.randomUUID(),
          projectId: id,
          document: project.document as Prisma.InputJsonValue,
          projectVersion: project.version,
          reason: "before_restore",
        },
      });
      await snapshotNormalizedProject(transaction, beforeRestore.id, id, project.document as Record<string, unknown>);
      const migratedDocument = await hydrateNormalizedSnapshot(transaction, selected.id, storedDocument);
      const alignedDocument = await alignSnapshotDocumentToProject(transaction, id, migratedDocument);
      await syncDocumentSheets(transaction, id, alignedDocument);
      await syncNormalizedDefinitions(transaction, id, alignedDocument);
      const document = withoutNormalizedDefinitions(alignedDocument);
      const restored = await transaction.project.update({
        where: { id },
        data: { document, version: { increment: 1 } },
      });
      return { project: restored };
    });
  } catch (error) {
    if (error instanceof NormalizedDefinitionError)
      return Response.json({ error: error.code, message: error.message }, { status: 422 });
    throw error;
  }

  if ("error" in result)
    return Response.json(
      { error: result.error },
      {
        status:
          result.error === "INVALID_SNAPSHOT"
            ? 422
            : result.error === "PROJECT_VERSION_CONFLICT"
              ? 409
              : 404,
      },
    );

  return Response.json({
    project: {
      id: result.project.id,
      document: result.project.document,
      version: Number(result.project.version),
      updatedAt: result.project.updatedAt.toISOString(),
    },
  });
}
