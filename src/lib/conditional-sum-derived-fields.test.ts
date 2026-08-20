import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateFieldValue,
  isNumericCalculatedField,
  type CalculatedField,
  type Sheet,
  type SheetRelation,
} from "../components/playground";

const resultSheet: Sheet = {
  id: "result-sheet",
  name: "합계",
  columns: ["코스트센터"],
  columnTypes: ["text"],
  rowIds: ["result-1"],
  rows: [["A"]],
};

const sourceSheet: Sheet = {
  id: "source-sheet",
  name: "원천",
  columns: ["코스트센터", "원본 금액", "원본 구분"],
  columnTypes: ["text", "text", "text"],
  rowIds: ["source-1", "source-2", "source-3"],
  rows: [
    ["A", "100원", " 대상 "],
    ["A", "200원", "대상"],
    ["A", "900원", "제외"],
  ],
};

const relation: SheetRelation = {
  id: "cost-center-relation",
  sourceSheetId: resultSheet.id,
  sourceColumn: "코스트센터",
  targetSheetId: sourceSheet.id,
  targetColumn: "코스트센터",
  relationType: "1:N",
  updateOption: "none",
  links: [],
};

const amountTransform: CalculatedField = {
  id: "amount-transform",
  kind: "transform",
  name: "정제 금액",
  resultSheetId: sourceSheet.id,
  sourceColumn: "원본 금액",
  condition: {
    enabled: false,
    column: "원본 금액",
    operator: "contains",
    value: "",
  },
  steps: [{ id: "digits", type: "digitsOnly" }],
  fallback: "empty",
  outputType: "number",
};

const categoryTransform: CalculatedField = {
  id: "category-transform",
  kind: "transform",
  name: "정제 구분",
  resultSheetId: sourceSheet.id,
  sourceColumn: "원본 구분",
  condition: {
    enabled: false,
    column: "원본 구분",
    operator: "contains",
    value: "",
  },
  steps: [{ id: "trim", type: "trim" }],
  fallback: "empty",
  outputType: "text",
};

const doubledAmount: CalculatedField = {
  id: "doubled-amount",
  kind: "arithmetic",
  name: "계산 금액",
  resultSheetId: sourceSheet.id,
  relationIds: [],
  formula: [
    {
      kind: "field",
      sheetId: sourceSheet.id,
      column: amountTransform.name,
      relationPath: [],
    },
    { kind: "operator", operator: "*" },
    { kind: "literal", value: "2" },
  ],
};

test("조건부합산은 타 시트의 정제 값과 정제 조건을 계산한다", () => {
  const conditionalSum: CalculatedField = {
    id: "conditional-sum",
    kind: "conditionalSum",
    name: "대상 합계",
    resultSheetId: resultSheet.id,
    sourceSheetId: sourceSheet.id,
    relationPath: [relation.id],
    valueColumn: amountTransform.name,
    conditions: [
      {
        id: "condition-1",
        sheetId: sourceSheet.id,
        relationPath: [relation.id],
        column: categoryTransform.name,
        operator: "eq",
        operand: { kind: "literal", value: "대상" },
      },
    ],
  };
  const calculatedFields = [
    amountTransform,
    categoryTransform,
    conditionalSum,
  ];

  assert.equal(
    calculateFieldValue(
      conditionalSum,
      [relation],
      [resultSheet, sourceSheet],
      resultSheet.rowIds[0],
      calculatedFields,
    ),
    "300",
  );
});

test("숫자 결과인 정제 필드만 합산 값 후보가 된다", () => {
  assert.equal(isNumericCalculatedField(amountTransform), true);
  assert.equal(isNumericCalculatedField(categoryTransform), false);
});

test("조건부합산은 다른 계산 필드가 참조한 정제 값까지 계산한다", () => {
  const conditionalSum: CalculatedField = {
    id: "calculated-conditional-sum",
    kind: "conditionalSum",
    name: "계산 결과 합계",
    resultSheetId: resultSheet.id,
    sourceSheetId: sourceSheet.id,
    relationPath: [relation.id],
    valueColumn: doubledAmount.name,
    conditions: [
      {
        id: "condition-2",
        sheetId: sourceSheet.id,
        relationPath: [relation.id],
        column: categoryTransform.name,
        operator: "eq",
        operand: { kind: "literal", value: "대상" },
      },
    ],
  };

  assert.equal(
    calculateFieldValue(
      conditionalSum,
      [relation],
      [resultSheet, sourceSheet],
      resultSheet.rowIds[0],
      [amountTransform, categoryTransform, doubledAmount, conditionalSum],
    ),
    "600",
  );
});
