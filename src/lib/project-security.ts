import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const cookiePrefix = "aporia_project_";

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(pin, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function projectAccessCookieName(projectId: string) {
  return `${cookiePrefix}${createHash("sha256").update(projectId).digest("hex").slice(0, 20)}`;
}

export function projectAccessToken(projectId: string, passwordHash: string) {
  return createHash("sha256").update(`${projectId}:${passwordHash}`).digest("hex");
}

export function requestHasProjectAccess(request: Request, projectId: string, passwordHash: string | null) {
  if (!passwordHash) return true;
  const name = projectAccessCookieName(projectId);
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1) === projectAccessToken(projectId, passwordHash);
}
