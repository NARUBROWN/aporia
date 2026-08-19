import { prisma } from "@/lib/prisma";
import { hashPin, isValidPin, projectAccessCookieName, projectAccessToken } from "@/lib/project-security";
import { requestHasOwnedProjectAccess } from "@/lib/auth";

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/password">) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  if (!isValidPin(body?.pin)) return Response.json({ error: "INVALID_PIN_FORMAT" }, { status: 400 });
  const current = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true, ownerId: true } });
  if (!current) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasOwnedProjectAccess(request, id, current.ownerId, current.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  if (current.passwordHash) return Response.json({ error: "PASSWORD_ALREADY_SET" }, { status: 409 });
  const passwordHash = hashPin(body.pin);
  await prisma.project.update({
    where: { id },
    data: { passwordHash },
    select: { id: true },
  });
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${projectAccessCookieName(id)}=${projectAccessToken(id, passwordHash)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
  return response;
}
