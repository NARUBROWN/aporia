import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectFormulaForValue } from "./conditional-calculation";

describe("selectFormulaForValue", () => {
  const fallback = ["기본식"];
  const cases = [
    { value: "A", formula: ["A식"] },
    { value: "B", formula: ["B식"] },
  ];

  it("조건값과 일치하는 수식을 선택한다", () => {
    assert.deepEqual(selectFormulaForValue(fallback, cases, "A"), ["A식"]);
    assert.deepEqual(selectFormulaForValue(fallback, cases, "B"), ["B식"]);
  });

  it("일치하는 조건이 없으면 기본 수식을 선택한다", () => {
    assert.equal(selectFormulaForValue(fallback, cases, "C"), fallback);
  });
});
