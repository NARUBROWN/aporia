import Link from "next/link";
import { AppShell, Topbar } from "@/components/app-shell";
import { Icons } from "@/components/icons";

const projects = [
  { name: "고객 주문 관리", desc: "고객, 상품, 주문 흐름", color: "violet", initial: "주", count: 8, time: "12분 전" },
  { name: "콘텐츠 승인 워크플로", desc: "콘텐츠 검수와 게시 승인", color: "mint", initial: "승", count: 5, time: "어제" },
  { name: "파트너 온보딩", desc: "입점 신청 및 심사 과정", color: "orange", initial: "온", count: 11, time: "3일 전" },
];

export default function Home() {
  return (
    <AppShell active="home">
      <Topbar title="홈" actions={<><button className="icon-button" aria-label="검색"><Icons.search /></button><Link className="button primary small" href="/projects/new"><Icons.plus />새 프로젝트</Link></>} />
      <main className="page-content dashboard">
        <section className="welcome-row">
          <div><span className="eyebrow">2026년 8월 10일</span><h2>안녕하세요, 원정님.</h2><p>아이디어를 눈에 보이는 시스템으로 만들어보세요.</p></div>
          <div className="mini-stat"><span className="stat-icon"><Icons.bolt /></span><div><strong>3</strong><small>진행 중인 프로젝트</small></div></div>
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
          <div className="project-grid">
            {projects.map((project) => <Link href="/playground" className="project-card" key={project.name}><div className={`project-thumb ${project.color}`}><span>{project.initial}</span><button aria-label="프로젝트 메뉴"><Icons.more /></button></div><div className="project-info"><h4>{project.name}</h4><p>{project.desc}</p><div><span><Icons.blocks />컴포넌트 {project.count}개</span><span>{project.time}</span></div></div></Link>)}
          </div>
        </section>

        <section className="steps-card"><div><span className="steps-badge">처음이신가요?</span><h3>3단계로 시작하세요</h3></div><ol><li><span>1</span><div><strong>데이터 정의</strong><small>업무에서 다루는 정보를 만드세요</small></div></li><li><span>2</span><div><strong>화면 구성</strong><small>컴포넌트를 끌어다 놓으세요</small></div></li><li><span>3</span><div><strong>흐름 실행</strong><small>실제 값의 변화를 확인하세요</small></div></li></ol><Link href="/playground" className="text-link">샘플 둘러보기<Icons.arrow /></Link></section>
      </main>
    </AppShell>
  );
}
