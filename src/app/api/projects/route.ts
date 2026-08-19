import { prisma } from "@/lib/prisma";
import { emptyProjectDocument, toProjectListItem } from "@/lib/projects";
import { authenticatedUserFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, ownerId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json(
    { projects: projects.map(toProjectListItem) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object")
    return Response.json({ error: "INVALID_PROJECT" }, { status: 400 });

  const input = body as { name?: unknown; description?: unknown };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  if (!name || name.length > 40 || description.length > 200)
    return Response.json({ error: "INVALID_PROJECT" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: user.id,
      name,
      document: emptyProjectDocument(description),
    },
  });
  return Response.json({ project: toProjectListItem(project) }, { status: 201 });
}
