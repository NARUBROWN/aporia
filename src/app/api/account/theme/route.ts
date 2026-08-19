import { authenticatedUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isThemeId } from "@/lib/themes";

export async function PATCH(request: Request) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { theme?: unknown } | null;
  if (!isThemeId(body?.theme)) return Response.json({ error: "INVALID_THEME" }, { status: 400 });
  await prisma.user.update({
    where: { id: user.id },
    data: { theme: body.theme },
    select: { id: true },
  });
  return Response.json({ theme: body.theme });
}
