import Link from "next/link";
import { Icons } from "@/components/icons";

const nav = [
  { href: "/", label: "홈", icon: Icons.home },
  { href: "/projects", label: "프로젝트", icon: Icons.folder },
  { href: "/playground", label: "플레이그라운드", icon: Icons.blocks },
];

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Aporia 홈">
      <span className="logo-mark"><span /><span /><span /></span>
      <span>aporia</span>
    </Link>
  );
}

export function AppShell({ children, active, compact = false }: { children: React.ReactNode; active: "home" | "projects" | "playground" | "settings"; compact?: boolean }) {
  const activePath = active === "home" ? "/" : `/${active}`;
  return (
    <div className={`app-frame ${compact ? "compact-shell" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top"><Logo /></div>
        <nav className="side-nav" aria-label="주요 메뉴">
          {nav.map((item) => {
            const NavIcon = item.icon;
            return <Link key={item.href} href={item.href} className={activePath === item.href ? "active" : ""}><NavIcon /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className={active === "settings" ? "active" : ""}><Icons.settings /><span>설정</span></Link>
          <button className="profile-row" type="button"><span className="avatar">김</span><span><strong>김원정</strong><small>워크스페이스 관리자</small></span><Icons.more /></button>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}

export function Topbar({ title, trail, actions }: { title: string; trail?: string; actions?: React.ReactNode }) {
  return <header className="topbar"><div>{trail && <span className="topbar-trail">{trail}<Icons.chevron /></span>}<h1>{title}</h1></div><div className="topbar-actions">{actions}</div></header>;
}
