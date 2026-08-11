import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project)
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

  const snapshots = await prisma.projectSnapshot.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectVersion: true,
      reason: true,
      createdAt: true,
    },
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
    const project = await transaction.project.upsert({
      where: { id },
      create: {
        id,
        name: id === "demo" ? "고객 관리 화면" : "새 프로젝트",
        document,
      },
      update: { document, version: { increment: 1 } },
    });
    const snapshot = await transaction.projectSnapshot.create({
      data: {
        id: crypto.randomUUID(),
        projectId: id,
        document,
        projectVersion: project.version,
        reason: "manual",
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
