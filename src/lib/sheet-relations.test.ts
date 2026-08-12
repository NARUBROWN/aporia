import assert from "node:assert/strict";
import test from "node:test";
import { upsertSheetRelation } from "./sheet-relations";

type Relation = {
  id: string;
  sourceSheetId: string;
  sourceColumn: string;
  targetSheetId: string;
  targetColumn: string;
};

const first: Relation = {
  id: "first",
  sourceSheetId: "cost-center",
  sourceColumn: "코스트센터",
  targetSheetId: "sap-cost",
  targetColumn: "코스트센터",
};

test("같은 출발 컬럼에서 서로 다른 시트로 향하는 관계를 함께 유지한다", () => {
  const second: Relation = {
    ...first,
    id: "second",
    targetSheetId: "budget",
  };

  assert.deepEqual(upsertSheetRelation([first], second), [first, second]);
});

test("출발과 도착 컬럼 조합이 모두 같은 관계만 교체한다", () => {
  const replacement: Relation = { ...first, id: "replacement" };

  assert.deepEqual(upsertSheetRelation([first], replacement), [replacement]);
});
