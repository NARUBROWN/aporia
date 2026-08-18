import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoredColumnType,
  validateSheetValue,
} from "./sheet-value-validation";

test("저장된 DB 타입을 데이터 시트 타입으로 변환한다", () => {
  assert.equal(normalizeStoredColumnType("NUMERIC(18,4)"), "number");
  assert.equal(normalizeStoredColumnType("BOOLEAN"), "boolean");
  assert.equal(normalizeStoredColumnType("TIMESTAMP"), "date");
  assert.equal(normalizeStoredColumnType("TEXT"), "text");
});

test("숫자 타입은 유효한 값을 정규화한다", () => {
  assert.deepEqual(validateSheetValue("number", "1,240.5"), {
    valid: true,
    value: "1240.5",
  });
  assert.equal(validateSheetValue("number", "12kg").valid, false);
  assert.equal(validateSheetValue("number", "1.2.3").valid, false);
});

test("날짜 타입은 실제 달력 날짜만 허용한다", () => {
  assert.deepEqual(validateSheetValue("date", "2024-02-29"), {
    valid: true,
    value: "2024-02-29",
  });
  assert.equal(validateSheetValue("date", "2023-02-29").valid, false);
  assert.equal(validateSheetValue("date", "2024/02/29").valid, false);
});

test("예/아니오 타입과 빈 값 규칙을 검증한다", () => {
  assert.deepEqual(validateSheetValue("boolean", "예"), {
    valid: true,
    value: "예",
  });
  assert.equal(validateSheetValue("boolean", "true").valid, false);
  assert.deepEqual(validateSheetValue("date", ""), { valid: true, value: "" });
});
