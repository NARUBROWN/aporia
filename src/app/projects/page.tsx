import Link from "next/link";
import { AppShell, Topbar } from "@/components/app-shell";
import { Icons } from "@/components/icons";
import { ProjectRows } from "@/components/project-list";
import { currentUser } from "@/lib/auth";
import { listOwnedProjects } from "@/lib/project-queries";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { projects } = await listOwnedProjects(user.id);
  return <AppShell active="projects"><Topbar title="프로젝트" actions={<Link className="button primary small" href="/projects/new"><Icons.plus />새 프로젝트</Link>} /><main className="page-content"><section className="list-heading"><div><h2>모든 프로젝트</h2><p>설계 중인 시스템과 데이터 흐름을 관리하세요.</p></div></section>{projects.length > 0 && <ProjectRows projects={projects} />}<Link className="empty-create" href="/projects/new"><span><Icons.plus /></span><strong>{projects.length > 0 ? "새 프로젝트 만들기" : "첫 프로젝트 만들기"}</strong><small>빈 플레이그라운드에서 시작하세요.</small></Link></main></AppShell>;
}
