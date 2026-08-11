import { AppShell, Topbar } from "@/components/app-shell";

export default function SettingsPage() {
  return <AppShell active="settings"><Topbar title="설정" /><main className="page-content narrow"><section className="settings-card"><h2>워크스페이스</h2><p>팀과 프로젝트의 기본 정보를 관리합니다.</p><label>워크스페이스 이름<input defaultValue="원정님의 워크스페이스" /></label><label>기본 언어<select defaultValue="ko"><option value="ko">한국어</option><option value="en">English</option></select></label><button className="button primary">변경사항 저장</button></section></main></AppShell>;
}
