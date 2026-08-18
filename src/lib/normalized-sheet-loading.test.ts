import assert from "node:assert/strict";
import test from "node:test";

import { expandRelatedSheetIds } from "./normalized-sheet-loading";

test("슬라이서와 계산식이 참조하는 기존 시트의 전체 관계 경로를 포함한다", () => {
  const required = expandRelatedSheetIds(
    ["calculation-result", "slicer-source"],
    [
      { sourceSheetId: "calculation-result", targetSheetId: "bridge" },
      { sourceSheetId: "bridge", targetSheetId: "calculation-source" },
      { sourceSheetId: "unrelated-a", targetSheetId: "unrelated-b" },
    ],
  );

  assert.deepEqual(
    [...required].sort(),
    ["bridge", "calculation-result", "calculation-source", "slicer-source"],
  );
});

test("관계 정의 순서와 무관하게 여러 단계 시트를 포함한다", () => {
  const required = expandRelatedSheetIds(["result"], [
    { sourceSheetId: "middle", targetSheetId: "source" },
    { sourceSheetId: "result", targetSheetId: "middle" },
  ]);

  assert.deepEqual([...required].sort(), ["middle", "result", "source"]);
});
