import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aporia",
  description: "도메인 시스템을 시각적으로 설계하고 실행하는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="desktop-site">{children}</div>
        <main className="mobile-blocked" aria-labelledby="mobile-blocked-title">
          <div className="mobile-blocked-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="mobile-blocked-kicker">APORIA WORKSPACE</p>
          <h1 id="mobile-blocked-title">
            모바일에서는<br />이용할 수 없어요
          </h1>
          <p>
            Aporia는 넓은 작업 공간이 필요한 서비스입니다.<br />
            데스크톱 환경에서 다시 접속해 주세요.
          </p>
          <div className="mobile-blocked-device" aria-hidden="true">
            <span className="mobile-blocked-screen">
              <span />
              <span />
              <span />
            </span>
            <span className="mobile-blocked-stand" />
          </div>
        </main>
      </body>
    </html>
  );
}
