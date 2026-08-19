import { prisma } from "@/lib/prisma";
import { requestHasOwnedProjectAccess } from "@/lib/auth";
import { loadProjectSheetMetadata } from "@/lib/project-bootstrap";

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

  const metadata = await loadProjectSheetMetadata(id);
  return Response.json(
    metadata,
    { headers: { "Cache-Control": "no-store" } },
  );
}
