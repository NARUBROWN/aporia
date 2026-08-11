import Link from "next/link";
import { AppShell, Topbar } from "@/components/app-shell";
import { Icons } from "@/components/icons";
import { ProjectCards } from "@/components/project-list";
import { prisma } from "@/lib/prisma";
import { toProjectListItem } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function Home() {
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const projects = (await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 3 })).map(toProjectListItem);
  return (
    <AppShell active="home">
      <Topbar title="홈" actions={<><button className="icon-button" aria-label="검색"><Icons.search /></button><Link className="button primary small" href="/projects/new"><Icons.plus />새 프로젝트</Link></>} />
      <main className="page-content dashboard">
        <section className="welcome-row">
          <div><span className="eyebrow">{today}</span><h2>안녕하세요</h2><p>아이디어를 눈에 보이는 시스템으로 만들어보세요.</p></div>
          <div className="mini-stat"><span className="stat-icon"><Icons.bolt /></span><div><strong>{await prisma.project.count({ where: { deletedAt: null } })}</strong><small>진행 중인 프로젝트</small></div></div>
        </section>

        <section className="quick-start">
          <div className="quick-copy"><span className="pill"><Icons.sparkles />빠른 시작</span><h3>새로운 시스템을<br/>설계해볼까요?</h3><p>코드 없이 컴포넌트를 연결하고<br/>데이터의 흐름을 직접 확인하세요.</p><Link href="/projects/new" className="button light">프로젝트 만들기<Icons.arrow /></Link></div>
          <div className="flow-preview" aria-label="시스템 흐름 미리보기">
            <div className="preview-grid" />
            <div className="flow-node node-form"><span><Icons.form /></span><div><small>INPUT</small><strong>주문 입력</strong><em>3개 필드</em></div></div>
            <div className="flow-line line-one"><i /></div>
            <div className="flow-node node-action"><span><Icons.bolt /></span><div><small>ACTION</small><strong>주문 생성</strong><em>데이터 저장</em></div></div>
            <div className="flow-line line-two"><i /></div>
            <div className="flow-node node-data"><span><Icons.database /></span><div><small>DATA</small><strong>Order</strong><em>8개 레코드</em></div></div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading"><div><h3>최근 프로젝트</h3><p>마지막으로 작업한 프로젝트입니다.</p></div><Link href="/projects">전체 보기<Icons.arrow /></Link></div>
          {projects.length > 0 ? <ProjectCards projects={projects} /> : <Link className="empty-create" href="/projects/new"><span><Icons.plus /></span><strong>첫 프로젝트 만들기</strong><small>빈 플레이그라운드에서 시작하세요.</small></Link>}
        </section>
      </main>
    </AppShell>
  );
}
