import Link from "next/link";
import { AppShell, Topbar } from "@/components/app-shell";
import { Icons } from "@/components/icons";
import { ProjectForm } from "@/components/project-form";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NewProjectPage() {
  if (!(await currentUser())) redirect("/login");
  return <AppShell active="projects"><Topbar title="새 프로젝트" trail="프로젝트" /><main className="page-content narrow"><div className="form-intro"><span className="big-icon"><Icons.folder /></span><h2>무엇을 설계할까요?</h2><p>프로젝트의 목적을 알려주세요. 나중에 언제든 수정할 수 있습니다.</p></div><ProjectForm /><p className="form-footnote">프로젝트를 만들면 <Link href="/playground">플레이그라운드</Link>로 이동합니다.</p></main></AppShell>;
}
