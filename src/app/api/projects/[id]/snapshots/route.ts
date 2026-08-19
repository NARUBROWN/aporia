import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requestHasOwnedProjectAccess } from "@/lib/auth";

type DocumentRecord = Record<string, unknown>;

function snapshotResponse(snapshot: {
  id: string;
  projectVersion: bigint;
  reason: string;
  createdAt: Date;
}) {
  return {
    id: snapshot.id,
    projectVersion: Number(snapshot.projectVersion),
    reason: snapshot.reason,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[id]/snapshots">,
) {
  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, passwordHash: true, ownerId: true },
  });
  if (!project)
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasOwnedProjectAccess(_request, id, project.ownerId, project.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const snapshots = await prisma.projectSnapshot.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectVersion: true,
      reason: true,
      createdAt: true,
    },
    take: 50,
  });

  return Response.json(
    { snapshots: snapshots.map(snapshotResponse) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/snapshots">,
) {
  const { id } = await context.params;
  const existing = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true, ownerId: true } });
  if (!existing) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasOwnedProjectAccess(request, id, existing.ownerId, existing.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 5_000_000)
    return Response.json({ error: "DOCUMENT_TOO_LARGE" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("document" in body) ||
    !body.document ||
    typeof body.document !== "object"
  )
    return Response.json({ error: "INVALID_DOCUMENT" }, { status: 400 });

  const document = body.document as DocumentRecord as Prisma.InputJsonValue;
  const result = await prisma.$transaction(async (transaction) => {
    const project = await transaction.project.update({
      where: { id },
      data: { document, version: { increment: 1 } },
      select: { id: true, version: true, updatedAt: true },
    });
    const snapshot = await transaction.projectSnapshot.create({
      data: {
        id: crypto.randomUUID(),
        projectId: id,
        document,
        projectVersion: project.version,
        reason: "manual",
      },
      select: {
        id: true,
        projectVersion: true,
        reason: true,
        createdAt: true,
      },
    });
    return { project, snapshot };
  });

  return Response.json({
    project: {
      id: result.project.id,
      version: Number(result.project.version),
      updatedAt: result.project.updatedAt.toISOString(),
    },
    snapshot: snapshotResponse(result.snapshot),
  });
}
