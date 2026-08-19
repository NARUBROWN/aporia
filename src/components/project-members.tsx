"use client";

import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";

type Member = {
  id: string;
  username: string;
  name: string;
  permission: "edit" | "view";
};

type UserResult = Pick<Member, "username" | "name">;

const errorMessages: Record<string, string> = {
  USER_NOT_FOUND: "가입된 사용자명을 찾지 못했습니다.",
  ALREADY_MEMBER: "이미 이 프로젝트에 참여 중인 사용자입니다.",
  OWNER_CANNOT_BE_MEMBER: "프로젝트 소유자는 초대할 수 없습니다.",
  MEMBER_LIMIT_REACHED: "프로젝트에는 최대 5명까지 초대할 수 있습니다.",
};

export function ProjectMembersButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [username, setUsername] = useState("");
  const [permission, setPermission] = useState<"edit" | "view">("edit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = username.trim();
    if (!open || !query) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/projects/${projectId}/members?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<{ users?: UserResult[] }>;
        })
        .then((payload) => setSearchResults(payload.users ?? []))
        .catch((searchError: unknown) => {
          if (!(searchError instanceof DOMException && searchError.name === "AbortError"))
            setSearchResults([]);
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, projectId, username]);

  async function loadMembers() {
    const response = await fetch(`/api/projects/${projectId}/members`, { cache: "no-store" });
    if (!response.ok) throw new Error("멤버 목록을 불러오지 못했습니다.");
    const payload = await response.json() as { members?: Member[] };
    setMembers(payload.members ?? []);
  }

  function openManager() {
    setOpen(true);
    setLoading(true);
    setError("");
    void loadMembers()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "멤버 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, permission }),
    });
    const payload = await response.json() as { error?: string; member?: Member };
    if (!response.ok) {
      setError(errorMessages[payload.error ?? ""] ?? "초대하지 못했습니다. 다시 시도해주세요.");
      setLoading(false);
      return;
    }
    if (payload.member) setMembers((current) => [...current, payload.member!]);
    setUsername("");
    setSearchResults([]);
    setLoading(false);
  }

  async function updateMember(memberId: string, nextPermission: "edit" | "view") {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission: nextPermission }),
    });
    if (!response.ok) setError("권한을 변경하지 못했습니다.");
    else setMembers((current) => current.map((member) => member.id === memberId ? { ...member, permission: nextPermission } : member));
    setLoading(false);
  }

  async function removeMember(memberId: string) {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
    if (!response.ok) setError("멤버를 내보내지 못했습니다.");
    else setMembers((current) => current.filter((member) => member.id !== memberId));
    setLoading(false);
  }

  return <>
    <button className="button secondary compact topbar-action-icon" type="button" onClick={openManager} aria-label="프로젝트 멤버 초대" title="프로젝트 멤버 초대"><Icons.userPlus /></button>
    {open && <div className="relation-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="relation-modal project-members-modal" role="dialog" aria-modal="true" aria-labelledby="project-members-title">
        <header><div><span><Icons.userPlus />멤버 관리</span></div><button type="button" aria-label="멤버 관리 닫기" onClick={() => setOpen(false)}>×</button></header>
        <section><h2 id="project-members-title">프로젝트에 멤버 초대</h2><p>가입된 사용자명으로 최대 5명까지 초대할 수 있습니다.</p>
          <form className="member-invite-form" onSubmit={invite}>
            <div className="member-user-search"><label htmlFor="member-username">사용자명</label><input id="member-username" role="combobox" aria-autocomplete="list" aria-expanded={!!username.trim()} aria-controls="member-search-results" value={username} onChange={(event) => { setUsername(event.target.value); if (!event.target.value.trim()) setSearchResults([]); }} placeholder="이름 또는 사용자명 검색" maxLength={30} autoComplete="off" />
              {!!username.trim() && <div className="member-search-results" id="member-search-results" role="listbox">{searching ? <p>검색 중…</p> : searchResults.length > 0 ? searchResults.map((result) => <button type="button" role="option" aria-selected={username === result.username} key={result.username} onClick={() => { setUsername(result.username); setSearchResults([]); }}><span className="member-avatar">{result.name.slice(0, 1)}</span><span><strong>{result.name}</strong><small>@{result.username}</small></span></button>) : <p>초대할 수 있는 사용자가 없습니다.</p>}</div>}
            </div>
            <label>권한<select value={permission} onChange={(event) => setPermission(event.target.value as "edit" | "view")}><option value="edit">편집 권한 (보기 포함)</option><option value="view">보기 권한</option></select></label>
            <button className="button primary" disabled={loading || !username.trim() || members.length >= 5}>{members.length >= 5 ? "초대 한도 도달" : "초대하기"}</button>
          </form>
          {error && <p className="member-error" role="alert">{error}</p>}
        </section>
        <section className="member-list-section"><div className="member-list-heading"><h2>초대된 멤버</h2><span>{members.length}/5명</span></div>
          {members.length === 0 ? <p className="member-empty">아직 초대된 멤버가 없습니다.</p> : <div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="member-avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>@{member.username}</small></div><select aria-label={`${member.name} 권한`} value={member.permission} disabled={loading} onChange={(event) => void updateMember(member.id, event.target.value as "edit" | "view")}><option value="edit">편집</option><option value="view">보기</option></select><button type="button" className="member-remove" disabled={loading} onClick={() => void removeMember(member.id)} aria-label={`${member.name} 내보내기`}><Icons.trash /></button></div>)}</div>}
        </section>
      </div>
    </div>}
  </>;
}
