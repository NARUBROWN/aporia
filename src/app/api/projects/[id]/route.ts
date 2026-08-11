import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const project = await prisma.project.findUnique({ where: { id } });

  if (!project) {
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(
    {
      project: {
        ...project,
        version: Number(project.version),
        updatedAt: project.updatedAt.toISOString(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const raw = await request.text();

  if (raw.length > 5_000_000) {
    return Response.json({ error: "DOCUMENT_TOO_LARGE" }, { status: 413 });
  }

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
    typeof body.document !== "object" ||
    !body.document
  ) {
    return Response.json({ error: "INVALID_DOCUMENT" }, { status: 400 });
  }

  const document = body.document as Prisma.InputJsonValue;
  const project = await prisma.project.upsert({
    where: { id },
    create: {
      id,
      name: id === "demo" ? "고객 관리 화면" : "새 프로젝트",
      document,
    },
    update: {
      document,
      version: { increment: 1 },
    },
  });

  return Response.json({
    project: {
      id: project.id,
      version: Number(project.version),
      updatedAt: project.updatedAt.toISOString(),
    },
  });
}
