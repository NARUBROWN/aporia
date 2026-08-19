import Link from "next/link";
import { Icons } from "@/components/icons";
import type { ProjectListItem } from "@/lib/projects";

const colors = ["violet", "mint", "orange"];

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function ProjectCards({ projects }: { projects: ProjectListItem[] }) {
  return <div className="project-grid">{projects.map((project, index) => <Link href={`/playground/${project.id}`} className="project-card" key={project.id}><div className={`project-thumb ${colors[index % colors.length]}`}><span>{project.name.slice(0, 1)}</span><span aria-hidden="true"><Icons.more /></span></div><div className="project-info"><h4>{project.name}{project.accessLevel !== "owner" && <small className="project-access-badge">{project.accessLevel === "edit" ? "편집" : "보기"}</small>}</h4><p>{project.description || "설명을 입력하지 않은 프로젝트"}</p><div><span><Icons.blocks />컴포넌트 {project.componentCount}개</span><span>{relativeTime(project.updatedAt)}</span></div></div></Link>)}</div>;
}

export function ProjectRows({ projects }: { projects: ProjectListItem[] }) {
  return <div className="project-list">{projects.map((project, index) => <Link href={`/playground/${project.id}`} className="project-list-item" key={project.id}><span className={`project-symbol ${colors[index % colors.length]}`}>{project.name.slice(0, 1)}</span><div className="project-list-copy"><h3>{project.name}{project.accessLevel !== "owner" && <small className="project-access-badge">{project.accessLevel === "edit" ? "편집 가능" : "보기 전용"}</small>}</h3><p>{project.description || "설명을 입력하지 않은 프로젝트"}</p></div><div className="project-list-meta"><span><Icons.blocks />{project.componentCount}개 컴포넌트</span><span><Icons.clock />{relativeTime(project.updatedAt)}</span></div><Icons.chevron className="row-chevron" /></Link>)}</div>;
}
