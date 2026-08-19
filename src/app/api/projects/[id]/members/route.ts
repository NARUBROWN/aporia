import { Prisma } from "@/generated/prisma/client";
import { authenticatedUserFromRequest, normalizeUsername } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const memberLimit = 5;

async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]/members">,
) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  if (!await ownedProject(id, user.id))
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query) {
    const users = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        deletedAt: null,
        projectMemberships: { none: { projectId: id } },
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ username: "asc" }],
      take: 8,
      select: { username: true, name: true },
    });
    return Response.json(
      { users },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      permission: true,
      createdAt: true,
      user: { select: { username: true, name: true } },
    },
  });
  return Response.json({
    limit: memberLimit,
    members: members.map((member) => ({
      id: member.id,
      username: member.user.username,
      name: member.user.name,
      permission: member.permission,
      createdAt: member.createdAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/members">,
) {
  const user = await authenticatedUserFromRequest(request);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    username?: unknown;
    permission?: unknown;
  } | null;
  const username = typeof body?.username === "string"
    ? normalizeUsername(body.username)
    : "";
  const permission = body?.permission;
  if (!username || (permission !== "edit" && permission !== "view"))
    return Response.json({ error: "INVALID_INVITATION" }, { status: 400 });

  try {
    const member = await prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id, ownerId: user.id, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new Error("FORBIDDEN");
      const invitee = await transaction.user.findFirst({
        where: { username, deletedAt: null },
        select: { id: true, username: true, name: true },
      });
      if (!invitee) throw new Error("USER_NOT_FOUND");
      if (invitee.id === user.id) throw new Error("OWNER_CANNOT_BE_MEMBER");
      const existing = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: invitee.id } },
        select: { id: true },
      });
      if (existing) throw new Error("ALREADY_MEMBER");
      if (await transaction.projectMember.count({ where: { projectId: id } }) >= memberLimit)
        throw new Error("MEMBER_LIMIT_REACHED");
      const created = await transaction.projectMember.create({
        data: { id: crypto.randomUUID(), projectId: id, userId: invitee.id, permission },
        select: { id: true, permission: true, createdAt: true },
      });
      return { ...created, user: invitee };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ member: {
      id: member.id,
      username: member.user.username,
      name: member.user.name,
      permission: member.permission,
      createdAt: member.createdAt.toISOString(),
    } }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "FORBIDDEN" ? 403
      : code === "USER_NOT_FOUND" ? 404
      : ["OWNER_CANNOT_BE_MEMBER", "ALREADY_MEMBER", "MEMBER_LIMIT_REACHED"].includes(code) ? 409
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" ? 409
      : 500;
    const responseCode = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
      ? "MEMBER_LIMIT_REACHED"
      : code || "INVITATION_FAILED";
    return Response.json({ error: responseCode }, { status });
  }
}
