import Link from "next/link";
import { Logo } from "@/components/logo";

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return <main className="legal-page"><header><Logo /><nav><Link href="/terms">이용약관</Link><Link href="/privacy">개인정보처리방침</Link></nav></header><article><span>시행일 {version}</span><h1>{title}</h1>{children}</article><footer><Link href="/signup">회원가입으로 돌아가기</Link></footer></main>;
}
