"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isThemeId, themes, type ThemeId } from "@/lib/themes";

export function AccountSettings({ username, name, theme }: { username: string; name: string; theme: string }) {
  const router = useRouter();
  const initialTheme: ThemeId = isThemeId(theme) ? theme : "indigo-lavender";
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(initialTheme);
  const [themeStatus, setThemeStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function deleteAccount() {
    setError("");
    const response = await fetch("/api/auth/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) return setError("비밀번호가 올바르지 않습니다.");
    router.push("/signup");
    router.refresh();
  }
  async function selectTheme(nextTheme: ThemeId) {
    const previousTheme = selectedTheme;
    setSelectedTheme(nextTheme);
    setThemeStatus("저장 중");
    document.querySelector<HTMLElement>(".app-frame")?.setAttribute("data-theme", nextTheme);
    const response = await fetch("/api/account/theme", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: nextTheme }) });
    if (!response.ok) {
      setSelectedTheme(previousTheme);
      document.querySelector<HTMLElement>(".app-frame")?.setAttribute("data-theme", previousTheme);
      setThemeStatus("저장하지 못했습니다");
      return;
    }
    setThemeStatus("저장됨");
    router.refresh();
  }
  return <>
    <section className="settings-card theme-settings"><div className="settings-card-heading"><div><h2>화면 테마</h2><p>워크스페이스에 사용할 색상 조합을 선택하세요.</p></div><span aria-live="polite">{themeStatus}</span></div><div className="theme-options" role="radiogroup" aria-label="화면 테마">{themes.map((option) => <button key={option.id} type="button" role="radio" aria-checked={selectedTheme === option.id} className={`theme-option ${selectedTheme === option.id ? "selected" : ""}`} onClick={() => void selectTheme(option.id)}><span className="theme-swatches" aria-hidden="true">{option.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{option.name}</strong><small>{option.description}</small></button>)}</div></section>
    <section className="settings-card"><h2>계정 정보</h2><p>현재 로그인한 계정입니다.</p><label>이름<input value={name} readOnly /></label><label>아이디<input value={username} disabled aria-disabled="true" title="아이디는 변경할 수 없습니다." /></label><button className="button secondary" onClick={() => void logout()}>로그아웃</button></section>
    <section className="settings-card danger-zone"><h2>회원탈퇴</h2><p>계정과 로그인 세션, 소유한 모든 프로젝트 및 데이터 시트가 즉시 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>{!deleting ? <button className="button danger" onClick={() => setDeleting(true)}>회원탈퇴</button> : <div className="account-delete-confirm"><label>확인을 위해 비밀번호를 입력하세요<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>{error && <p role="alert" className="auth-error">{error}</p>}<div><button className="button secondary" onClick={() => { setDeleting(false); setPassword(""); setError(""); }}>취소</button><button className="button danger" disabled={password.length < 8} onClick={() => void deleteAccount()}>모든 데이터 삭제 후 탈퇴</button></div></div>}</section>
  </>;
}
