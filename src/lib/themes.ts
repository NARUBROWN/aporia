export const themes = [
  { id: "indigo-lavender", name: "인디고 · 라벤더", description: "창의적이고 차분한 기본 테마", colors: ["#5146a5", "#a99af2", "#f5f3fa"] },
  { id: "navy-lime", name: "네이비 · 라임", description: "신뢰감 있는 데이터 도구 테마", colors: ["#24324a", "#b8d96b", "#f3f5f8"] },
  { id: "classic-green", name: "클래식 그린", description: "기존 Aporia의 자연스러운 테마", colors: ["#225f46", "#dff3ac", "#f5f7f5"] },
  { id: "midnight", name: "다크 모드", description: "눈의 피로를 줄이는 어두운 작업 환경", colors: ["#0b1020", "#1b2638", "#8b7cf6"] },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
