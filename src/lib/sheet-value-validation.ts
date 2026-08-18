export type SheetColumnType = "text" | "number" | "date" | "boolean";

export function normalizeStoredColumnType(type: string): SheetColumnType {
  const value = type.toLowerCase();
  if (value.includes("date") || value.includes("time")) return "date";
  if (value.includes("bool")) return "boolean";
  if (/int|numeric|decimal|real|double|money/.test(value)) return "number";
  return "text";
}

export type SheetValueValidation =
  | { valid: true; value: string }
  | { valid: false; message: string };

function isValidCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateSheetValue(
  type: SheetColumnType,
  value: string,
): SheetValueValidation {
  if (value === "" || type === "text") return { valid: true, value };

  if (type === "number") {
    const trimmed = value.trim();
    if (!/^-?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(trimmed)) {
      return { valid: false, message: "숫자만 입력해주세요. 예: 1200 또는 12.5" };
    }
    const normalized = trimmed.replaceAll(",", "");
    if (!Number.isFinite(Number(normalized))) {
      return { valid: false, message: "유효한 범위의 숫자를 입력해주세요." };
    }
    return { valid: true, value: normalized };
  }

  if (type === "date") {
    if (!isValidCalendarDate(value)) {
      return { valid: false, message: "날짜를 YYYY-MM-DD 형식으로 입력해주세요." };
    }
    return { valid: true, value };
  }

  if (value !== "예" && value !== "아니오") {
    return { valid: false, message: "예 또는 아니오만 입력할 수 있어요." };
  }
  return { valid: true, value };
}
