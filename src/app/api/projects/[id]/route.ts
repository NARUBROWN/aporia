import { db } from "@/lib/db";

type ProjectRow = {
  id: string;
  name: string;
  document: Record<string, unknown>;
  version: string;
  updated_at: Date;
};

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const result = await db.query<ProjectRow>(
    "SELECT id, name, document, version, updated_at FROM projects WHERE id = $1",
    [id],
  );
  const project = result.rows[0];

  if (!project) {
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(
    {
      project: {
        ...project,
        version: Number(project.version),
        updatedAt: project.updated_at.toISOString(),
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

  const result = await db.query<ProjectRow>(
    `INSERT INTO projects (id, name, document)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE
     SET document = EXCLUDED.document,
         version = projects.version + 1,
         updated_at = NOW()
     RETURNING id, name, document, version, updated_at`,
    [
      id,
      id === "demo" ? "고객 관리 화면" : "새 프로젝트",
      JSON.stringify(body.document),
    ],
  );
  const project = result.rows[0];

  return Response.json({
    project: {
      id: project.id,
      version: Number(project.version),
      updatedAt: project.updated_at.toISOString(),
    },
  });
}
