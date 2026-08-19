"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountSettings({ username, name }: { username: string; name: string }) {
  const router = useRouter();
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
  return <>
    <section className="settings-card"><h2>계정 정보</h2><p>현재 로그인한 계정입니다.</p><label>이름<input value={name} readOnly /></label><label>아이디<input value={username} readOnly /></label><button className="button secondary" onClick={() => void logout()}>로그아웃</button></section>
    <section className="settings-card danger-zone"><h2>회원탈퇴</h2><p>계정과 로그인 세션, 소유한 모든 프로젝트 및 데이터 시트가 즉시 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>{!deleting ? <button className="button danger" onClick={() => setDeleting(true)}>회원탈퇴</button> : <div className="account-delete-confirm"><label>확인을 위해 비밀번호를 입력하세요<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>{error && <p role="alert" className="auth-error">{error}</p>}<div><button className="button secondary" onClick={() => { setDeleting(false); setPassword(""); setError(""); }}>취소</button><button className="button danger" disabled={password.length < 8} onClick={() => void deleteAccount()}>모든 데이터 삭제 후 탈퇴</button></div></div>}</section>
  </>;
}
