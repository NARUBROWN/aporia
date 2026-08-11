import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aporia",
  description: "도메인 시스템을 시각적으로 설계하고 실행하는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
