import { expiredSessionCookie, sessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (session) await prisma.authSession.delete({ where: { id: session.id } });
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": expiredSessionCookie() } },
  );
}
