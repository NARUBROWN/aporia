"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

export function ProfileMenu({ name, username }: { name: string; username: string }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.push("/login");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        type="button"
        className="profile-row"
        aria-label={`${name} 프로필 메뉴`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${name} 프로필 메뉴`}
        onClick={() => {
          setError("");
          setOpen((current) => !current);
        }}
      >
        <span className="avatar">{name.slice(0, 1)}</span>
        <span><strong>{name}</strong><small>@{username}</small></span>
        <Icons.more />
      </button>
      {open && (
        <div className="profile-popover" role="menu">
          <button type="button" role="menuitem" disabled={loggingOut} onClick={() => void logout()}>
            <Icons.logOut />
            <span>{loggingOut ? "로그아웃 중" : "로그아웃"}</span>
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
