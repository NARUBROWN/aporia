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

test("조건부합산은 정제 필드를 관계 키로 사용한다", () => {
  const cotSheet: Sheet = {
    id: "cot-sheet",
    name: "COT유틸Total",
    columns: ["코스트센터"],
    columnTypes: ["text"],
    rowIds: ["cot-1"],
    rows: [["121401"]],
  };
  const utilitySheet: Sheet = {
    id: "utility-sheet",
    name: "STG_SAP_ZCOT0110",
    columns: ["OBJNR", "금액"],
    columnTypes: ["text", "number"],
    rowIds: ["utility-1", "utility-2"],
    rows: [
      ["KS10000000121401", "100"],
      ["KS10000000121402", "900"],
    ],
  };
  const extractedCostCenter: CalculatedField = {
    id: "extracted-cost-center",
    kind: "transform",
    name: "COT NO 추출",
    resultSheetId: utilitySheet.id,
    sourceColumn: "OBJNR",
    condition: {
      enabled: false,
      column: "OBJNR",
      operator: "contains",
      value: "",
    },
    steps: [{ id: "take-right", type: "takeRight", length: 6 }],
    fallback: "empty",
    outputType: "text",
  };
  const derivedRelation: SheetRelation = {
    id: "derived-key-relation",
    sourceSheetId: cotSheet.id,
    sourceColumn: "코스트센터",
    targetSheetId: utilitySheet.id,
    targetColumn: extractedCostCenter.name,
    relationType: "1:N",
    updateOption: "none",
    links: [],
  };
  const conditionalSum: CalculatedField = {
    id: "derived-relation-sum",
    kind: "conditionalSum",
    name: "유틸 합계",
    resultSheetId: cotSheet.id,
    sourceSheetId: utilitySheet.id,
    relationPath: [derivedRelation.id],
    valueColumn: "금액",
    conditions: [
      {
        id: "all-nonblank",
        sheetId: utilitySheet.id,
        relationPath: [derivedRelation.id],
        column: extractedCostCenter.name,
        operator: "isNotBlank",
        operand: { kind: "literal", value: "" },
      },
    ],
  };

  assert.equal(
    calculateFieldValue(
      conditionalSum,
      [derivedRelation],
      [cotSheet, utilitySheet],
      cotSheet.rowIds[0],
      [extractedCostCenter, conditionalSum],
    ),
    "100",
  );
});
