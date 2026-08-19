import { authenticatedUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidPin, verifyPin } from "@/lib/project-security";

export async function GET(request: Request) {
  if (!(await authenticatedUserFromRequest(request)))
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { ownerId: null, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, passwordHash: true, updatedAt: true },
  });
  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      protected: !!project.passwordHash,
      updatedAt: project.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { projectId?: unknown; pin?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: null, deletedAt: null },
    select: { passwordHash: true },
  });
  if (!project) return Response.json({ error: "PROJECT_ALREADY_CLAIMED" }, { status: 409 });
  if (project.passwordHash) {
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!isValidPin(pin) || !verifyPin(pin, project.passwordHash))
      return Response.json({ error: "INVALID_PIN" }, { status: 403 });
  }
  const claimed = await prisma.project.updateMany({
    where: { id: projectId, ownerId: null, deletedAt: null },
    data: { ownerId: user.id },
  });
  if (claimed.count !== 1)
    return Response.json({ error: "PROJECT_ALREADY_CLAIMED" }, { status: 409 });
  return Response.json({ ok: true });
}
