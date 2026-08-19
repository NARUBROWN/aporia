import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Playground } from "@/components/playground";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { ProjectPinGate } from "@/components/project-pin-gate";
import { projectAccessCookieName, projectAccessToken } from "@/lib/project-security";
import { currentUser } from "@/lib/auth";

export default async function ProjectPlaygroundPage({ params }: PageProps<"/playground/[id]">) {
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, passwordHash: true, ownerId: true } });
  if (!project) notFound();
  const user = await currentUser();
  const membership = project.ownerId && user?.id !== project.ownerId && user
    ? await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: user.id } }, select: { permission: true } })
    : null;
  if (project.ownerId && user?.id !== project.ownerId && !membership) notFound();
  if (!project.ownerId && project.passwordHash) {
    const access = (await cookies()).get(projectAccessCookieName(id))?.value;
    if (access !== projectAccessToken(id, project.passwordHash))
      return <ProjectPinGate projectId={id} projectName={project.name} />;
  }
  const accessLevel = !project.ownerId ? "edit" : user?.id === project.ownerId ? "owner" : membership?.permission === "edit" ? "edit" : "view";
  return <AppShell active="playground" compact><Playground projectId={project.id} projectName={project.name} hasPassword={!!project.passwordHash} accessLevel={accessLevel} /></AppShell>;
}
