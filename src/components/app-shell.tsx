import Link from "next/link";
import { Icons } from "@/components/icons";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/auth";

const nav = [
  { href: "/", label: "홈", icon: Icons.home },
  { href: "/projects", label: "프로젝트", icon: Icons.folder },
  { href: "/playground", label: "플레이그라운드", icon: Icons.blocks },
];

export async function AppShell({ children, active, compact = false }: { children: React.ReactNode; active: "home" | "projects" | "playground" | "settings"; compact?: boolean }) {
  const activePath = active === "home" ? "/" : `/${active}`;
  const user = await currentUser();
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
          {user ? <Link href="/settings" className="profile-row"><span className="avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>@{user.username}</small></span><Icons.more /></Link> : <div className="sidebar-auth-links"><Link href="/login" aria-label="로그인" title="로그인"><Icons.logIn /><span>로그인</span></Link><Link href="/signup" aria-label="회원가입" title="회원가입"><Icons.userPlus /><span>회원가입</span></Link></div>}
        </div>
      </aside>
      <div className="app-main">{children}</div>
      <footer className="app-footer"><span>© {new Date().getFullYear()} Aporia</span><nav aria-label="법적 고지"><Link href="/terms">이용약관</Link><Link href="/privacy">개인정보처리방침</Link></nav></footer>
    </div>
  );
}

export function Topbar({ title, trail, actions }: { title: string; trail?: string; actions?: React.ReactNode }) {
  return <header className="topbar"><div>{trail && <span className="topbar-trail">{trail}<Icons.chevron /></span>}<h1>{title}</h1></div><div className="topbar-actions">{actions}</div></header>;
}
