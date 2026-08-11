"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

export function ProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  return <form className="project-form" onSubmit={async (event) => { event.preventDefault(); setSubmitting(true); setError(""); try { const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }) }); if (!response.ok) throw new Error(); const payload = await response.json() as { project: { id: string } }; router.push(`/playground/${payload.project.id}`); } catch { setError("프로젝트를 만들지 못했습니다. 다시 시도해주세요."); setSubmitting(false); } }}><div className="field-group"><label htmlFor="project-name">프로젝트 이름</label><input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 고객 주문 관리" required maxLength={40} /><small>{name.length}/40</small></div><div className="field-group"><label htmlFor="project-desc">한 줄 설명 <em>선택</em></label><textarea id="project-desc" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="이 프로젝트가 해결할 업무를 간단히 적어주세요." rows={3} /></div><fieldset><legend>시작 방식</legend><div className="template-grid"><label className="template-card selected"><input type="radio" checked readOnly /><span className="template-icon"><Icons.plus /></span><span><strong>빈 프로젝트</strong><small>빈 플레이그라운드에서 자유롭게 설계합니다.</small></span><i><Icons.check /></i></label></div></fieldset>{error && <p role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={() => router.back()}>취소</button><button type="submit" className="button primary" disabled={!name.trim() || submitting}>{submitting ? "만드는 중" : "프로젝트 만들기"}<Icons.arrow /></button></div></form>;
}
