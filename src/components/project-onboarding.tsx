"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClaimableProject = { id: string; name: string; protected: boolean; updatedAt: string };

export function ProjectOnboarding({ name }: { name: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ClaimableProject[]>([]);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState("");

  useEffect(() => {
    fetch("/api/onboarding/projects", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { projects?: ClaimableProject[] }) => setProjects(payload.projects ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function claim(project: ClaimableProject) {
    setClaiming(project.id);
    setErrors((current) => ({ ...current, [project.id]: "" }));
    const response = await fetch("/api/onboarding/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, pin: pins[project.id] ?? "" }),
    });
    if (response.ok) {
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } else {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setErrors((current) => ({ ...current, [project.id]: payload.error === "INVALID_PIN" ? "프로젝트 비밀번호가 올바르지 않습니다." : "다른 계정이 먼저 가져간 프로젝트입니다." }));
    }
    setClaiming("");
  }

  return <main className="onboarding-page"><section className="onboarding-card"><span>WELCOME TO APORIA</span><h1>{name}님의 워크스페이스를 준비할게요</h1><p>기존 프로젝트가 있다면 지금 내 워크스페이스로 가져올 수 있습니다.</p>{loading ? <div className="onboarding-empty">프로젝트를 확인하고 있습니다.</div> : projects.length === 0 ? <div className="onboarding-empty">가져올 수 있는 기존 프로젝트가 없습니다.</div> : <div className="claim-project-list">{projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><small>{project.protected ? "비밀번호 확인 필요" : "먼저 가져가면 내 워크스페이스에 귀속됩니다."}</small></div>{project.protected && <input aria-label={`${project.name} 비밀번호`} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pins[project.id] ?? ""} onChange={(event) => setPins((current) => ({ ...current, [project.id]: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="4자리 비밀번호" />}<button className="button secondary" disabled={claiming === project.id || (project.protected && (pins[project.id]?.length ?? 0) !== 4)} onClick={() => void claim(project)}>{claiming === project.id ? "가져오는 중" : "가져오기"}</button>{errors[project.id] && <p role="alert">{errors[project.id]}</p>}</article>)}</div>}<div className="onboarding-actions"><button className="button primary" onClick={() => { router.push("/"); router.refresh(); }}>워크스페이스 시작</button></div></section></main>;
}
