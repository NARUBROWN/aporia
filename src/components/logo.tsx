import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Aporia 홈">
      <span className="logo-mark"><span /><span /><span /></span>
      <span>aporia</span>
    </Link>
  );
}
