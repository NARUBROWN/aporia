import assert from "node:assert/strict";
import test from "node:test";
import { hashPin, isValidPin, projectAccessToken, verifyPin } from "./project-security";

test("프로젝트 PIN은 숫자 4자리만 허용한다", () => {
  assert.equal(isValidPin("1234"), true);
  assert.equal(isValidPin("123"), false);
  assert.equal(isValidPin("12a4"), false);
});

test("PIN은 솔트된 해시로 검증한다", () => {
  const first = hashPin("1234");
  const second = hashPin("1234");
  assert.notEqual(first, second);
  assert.equal(verifyPin("1234", first), true);
  assert.equal(verifyPin("4321", first), false);
});

test("접근 토큰은 프로젝트와 비밀번호 해시에 종속된다", () => {
  const passwordHash = hashPin("1234");
  assert.notEqual(projectAccessToken("one", passwordHash), projectAccessToken("two", passwordHash));
});
