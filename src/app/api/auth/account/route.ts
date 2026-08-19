import { expiredSessionCookie, sessionFromRequest, verifyAccountPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postgres, quoteRegisteredIdentifier } from "@/lib/postgres";

export async function DELETE(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session || session.expiresAt <= new Date() || session.user.deletedAt)
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!verifyAccountPassword(password, session.user.passwordHash))
    return Response.json({ error: "INVALID_PASSWORD" }, { status: 403 });
  const sheets = await prisma.projectSheet.findMany({
    where: { project: { ownerId: session.userId } },
    select: { physicalTableName: true },
  });
  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    for (const sheet of sheets)
      await client.query(`DROP TABLE IF EXISTS project_data.${quoteRegisteredIdentifier(sheet.physicalTableName)}`);
    await client.query('DELETE FROM "projects" WHERE "owner_id" = $1', [session.userId]);
    await client.query('DELETE FROM "auth_sessions" WHERE "user_id" = $1', [session.userId]);
    await client.query('DELETE FROM "users" WHERE "id" = $1', [session.userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredSessionCookie() } });
}
