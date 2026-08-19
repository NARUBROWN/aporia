"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [age14Confirmed, setAge14Confirmed] = useState(false);
  const signup = mode === "signup";
  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        const response = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, name, password, termsAccepted, privacyAccepted, age14Confirmed }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          setError(payload.error === "USERNAME_TAKEN" ? "이미 사용 중인 아이디입니다." : signup ? "입력값을 확인해 주세요." : "아이디 또는 비밀번호가 올바르지 않습니다.");
          setSubmitting(false);
          return;
        }
        router.push(signup ? "/onboarding" : "/");
        router.refresh();
      }}>
        <Logo />
        <span>{signup ? "계정 만들기" : "다시 오신 것을 환영합니다"}</span>
        <h1>{signup ? "회원가입" : "로그인"}</h1>
        {signup && <label>이름<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={40} autoComplete="name" required /></label>}
        <label>아이디<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))} minLength={4} maxLength={30} pattern="[a-z0-9_]{4,30}" autoComplete="username" required /><small>영문 소문자, 숫자, 밑줄 4~30자</small></label>
        <label>비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete={signup ? "new-password" : "current-password"} required /><small>8자 이상 입력해 주세요.</small></label>
        {signup && <fieldset className="signup-consents"><legend>필수 확인 및 동의</legend><label><input type="checkbox" checked={age14Confirmed} onChange={(event) => setAge14Confirmed(event.target.checked)} required /><span>만 14세 이상입니다. (필수)</span></label><label><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /><span><Link href="/terms" target="_blank" rel="noreferrer">이용약관</Link>에 동의합니다. (필수)</span></label><label><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} required /><span><Link href="/privacy" target="_blank" rel="noreferrer">개인정보 수집·이용 및 처리방침</Link>에 동의합니다. (필수)</span></label><small>Aporia는 14세 미만 가입을 받지 않습니다. 회원가입을 완료하면 위 약관과 개인정보 처리 내용에 동의한 것으로 처리됩니다.</small></fieldset>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="button primary" disabled={submitting || (signup && (!age14Confirmed || !termsAccepted || !privacyAccepted))}>{submitting ? "처리 중" : signup ? "동의하고 계정 만들기" : "로그인"}</button>
        <p>{signup ? "이미 계정이 있나요?" : "처음이신가요?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "로그인" : "회원가입"}</Link></p>
      </form>
    </main>
  );
}
