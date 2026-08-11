"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectPinGate({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return <main className="pin-gate"><form onSubmit={async (event) => { event.preventDefault(); setSubmitting(true); setError(""); const response = await fetch(`/api/projects/${projectId}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }); if (response.ok) { router.refresh(); return; } setError("비밀번호가 올바르지 않습니다."); setSubmitting(false); }}><span>PROTECTED PROJECT</span><h1>{projectName}</h1><p>프로젝트에 입장하려면 4자리 숫자 비밀번호를 입력하세요.</p><input aria-label="프로젝트 비밀번호" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoFocus value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />{error && <small role="alert">{error}</small>}<button className="button primary" disabled={pin.length !== 4 || submitting}>{submitting ? "확인 중" : "입장하기"}</button></form></main>;
}
