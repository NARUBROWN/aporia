import { authenticatedUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ownerCanManage(request: Request, projectId: string) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return { error: "UNAUTHORIZED", status: 401 } as const;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { error: "FORBIDDEN", status: 403 } as const;
  return { user } as const;
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]/members/[memberId]">,
) {
  const { id, memberId } = await context.params;
  const access = await ownerCanManage(request, id);
  if ("error" in access)
    return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null) as { permission?: unknown } | null;
  if (body?.permission !== "edit" && body?.permission !== "view")
    return Response.json({ error: "INVALID_PERMISSION" }, { status: 400 });
  const updated = await prisma.projectMember.updateMany({
    where: { id: memberId, projectId: id },
    data: { permission: body.permission },
  });
  if (!updated.count) return Response.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]/members/[memberId]">,
) {
  const { id, memberId } = await context.params;
  const access = await ownerCanManage(request, id);
  if ("error" in access)
    return Response.json({ error: access.error }, { status: access.status });
  const deleted = await prisma.projectMember.deleteMany({ where: { id: memberId, projectId: id } });
  if (!deleted.count) return Response.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true });
}
