import { prisma } from "@/lib/prisma";
import { isValidPin, projectAccessCookieName, projectAccessToken, verifyPin } from "@/lib/project-security";

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/unlock">) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true } });
  if (!project) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!project.passwordHash || !isValidPin(body?.pin) || !verifyPin(body.pin, project.passwordHash))
    return Response.json({ error: "INVALID_PIN" }, { status: 401 });
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${projectAccessCookieName(id)}=${projectAccessToken(id, project.passwordHash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
  return response;
}
