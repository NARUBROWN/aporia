import Link from "next/link";
import { AppShell, Topbar } from "@/components/app-shell";
import { Icons } from "@/components/icons";

const projects = [
  ["고객 주문 관리", "고객의 주문 접수부터 결제 상태까지 관리합니다.", "주", "violet", "8", "12분 전"],
  ["콘텐츠 승인 워크플로", "콘텐츠 작성과 검수, 게시 승인 과정을 연결합니다.", "승", "mint", "5", "어제"],
  ["파트너 온보딩", "파트너 입점 신청과 서류 심사 과정을 관리합니다.", "온", "orange", "11", "3일 전"],
];

export default function ProjectsPage() {
  return <AppShell active="projects"><Topbar title="프로젝트" actions={<Link className="button primary small" href="/projects/new"><Icons.plus />새 프로젝트</Link>} /><main className="page-content"><section className="list-heading"><div><h2>모든 프로젝트</h2><p>설계 중인 시스템과 데이터 흐름을 관리하세요.</p></div><label className="search-field"><Icons.search /><input aria-label="프로젝트 검색" placeholder="프로젝트 검색" /></label></section><div className="project-list">{projects.map(([name, desc, initial, color, count, time]) => <Link href="/playground" className="project-list-item" key={name}><span className={`project-symbol ${color}`}>{initial}</span><div className="project-list-copy"><h3>{name}</h3><p>{desc}</p></div><div className="project-list-meta"><span><Icons.blocks />{count}개 컴포넌트</span><span><Icons.clock />{time}</span></div><Icons.chevron className="row-chevron" /></Link>)}</div><Link className="empty-create" href="/projects/new"><span><Icons.plus /></span><strong>새 프로젝트 만들기</strong><small>빈 캔버스 또는 템플릿으로 시작하세요.</small></Link></main></AppShell>;
}
