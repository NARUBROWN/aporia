import { createSession, normalizeUsername, sessionCookie, validPassword, validUsername, verifyAccountPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!validUsername(username) || !validPassword(password))
    return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.deletedAt || !verifyAccountPassword(password, user.passwordHash))
    return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  const session = await createSession(user.id);
  return Response.json(
    { user: { id: user.id, username: user.username, name: user.name } },
    { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
  );
}
