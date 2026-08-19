import { createSession, hashAccountPassword, normalizeUsername, sessionCookie, validPassword, validUsername } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { privacyVersion, termsVersion } from "@/lib/legal";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; name?: unknown; password?: unknown; termsAccepted?: unknown; privacyAccepted?: unknown; age14Confirmed?: unknown } | null;
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!validUsername(username) || name.length < 2 || name.length > 40 || !validPassword(password) || body?.age14Confirmed !== true || body?.termsAccepted !== true || body?.privacyAccepted !== true)
    return Response.json({ error: "INVALID_ACCOUNT" }, { status: 400 });
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists && !exists.deletedAt)
    return Response.json({ error: "USERNAME_TAKEN" }, { status: 409 });
  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), username, name, passwordHash: hashAccountPassword(password), termsAgreedAt: new Date(), privacyAgreedAt: new Date(), termsVersion, privacyVersion },
  });
  const session = await createSession(user.id);
  return Response.json(
    { user: { id: user.id, username: user.username, name: user.name } },
    { status: 201, headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
  );
}
