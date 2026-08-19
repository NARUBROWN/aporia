import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requestHasProjectAccess } from "@/lib/project-security";

export const sessionCookieName = "aporia_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z0-9_]{4,30}$/.test(normalizeUsername(value));
}

export function validPassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}

export function hashAccountPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyAccountPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await prisma.authSession.create({
    data: { id: crypto.randomUUID(), userId, tokenHash: tokenHash(token), expiresAt },
  });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function expiredSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function currentUser() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.deletedAt) return null;
  return { id: session.user.id, username: session.user.username, name: session.user.name };
}

export async function sessionFromRequest(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${sessionCookieName}=`))?.slice(sessionCookieName.length + 1);
  if (!token) return null;
  return prisma.authSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
}

export async function authenticatedUserFromRequest(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session || session.expiresAt <= new Date() || session.user.deletedAt)
    return null;
  return { id: session.user.id, username: session.user.username, name: session.user.name };
}

export async function requestHasOwnedProjectAccess(
  request: Request,
  projectId: string,
  ownerId: string | null,
  passwordHash: string | null,
) {
  if (ownerId) return (await authenticatedUserFromRequest(request))?.id === ownerId;
  return requestHasProjectAccess(request, projectId, passwordHash);
}
