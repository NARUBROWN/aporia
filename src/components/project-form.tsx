"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

const templates = [
  { id: "blank", title: "빈 프로젝트", desc: "처음부터 자유롭게 설계합니다.", icon: Icons.plus },
  { id: "order", title: "주문 관리", desc: "고객, 상품, 주문 모델을 포함합니다.", icon: Icons.database },
  { id: "approval", title: "승인 워크플로", desc: "요청, 검토, 승인 흐름을 포함합니다.", icon: Icons.check },
];

export function ProjectForm() {
  const router = useRouter();
  const [template, setTemplate] = useState("blank");
  const [name, setName] = useState("");
  return <form className="project-form" onSubmit={(event) => { event.preventDefault(); router.push("/playground"); }}><div className="field-group"><label htmlFor="project-name">프로젝트 이름</label><input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 고객 주문 관리" required maxLength={40} /><small>{name.length}/40</small></div><div className="field-group"><label htmlFor="project-desc">한 줄 설명 <em>선택</em></label><textarea id="project-desc" placeholder="이 프로젝트가 해결할 업무를 간단히 적어주세요." rows={3} /></div><fieldset><legend>시작 방식</legend><div className="template-grid">{templates.map((item) => { const TemplateIcon = item.icon; return <label className={template === item.id ? "template-card selected" : "template-card"} key={item.id}><input type="radio" name="template" value={item.id} checked={template === item.id} onChange={() => setTemplate(item.id)} /><span className="template-icon"><TemplateIcon /></span><span><strong>{item.title}</strong><small>{item.desc}</small></span><i>{template === item.id && <Icons.check />}</i></label>; })}</div></fieldset><div className="form-actions"><button type="button" className="button secondary" onClick={() => router.back()}>취소</button><button type="submit" className="button primary" disabled={!name.trim()}>프로젝트 만들기<Icons.arrow /></button></div></form>;
}
