"use client";

import { validateSheetValue } from "@/lib/sheet-value-validation";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

type ComponentKind =
  | "input"
  | "radio"
  | "search"
  | "button"
  | "table"
  | "pagination"
  | "condition"
  | "text";
type CanvasItem = {
  id: string;
  kind: ComponentKind;
  label: string;
  subtitle?: string;
  showSubtitle?: boolean;
  fontSize?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};
type ColumnType = "text" | "number" | "date" | "boolean";
type Sheet = {
  id: string;
  name: string;
  columns: string[];
  columnTypes?: (ColumnType | null)[];
  rowIds: string[];
  rows: string[][];
};
type DisplayBinding = {
  sheetId: string;
  field: string;
  fields: string[];
  rowId: string;
};
type DisplayBindings = Record<string, DisplayBinding>;
type RelationType = "1:1" | "1:N" | "N:1" | "N:N";
type SheetViewMode = "grid" | "erd";
type JoinCandidate = {
  id: string;
  leftColumn: number;
  rightColumn: number;
  kind: "number" | "text";
  matches: string[];
};
type DataBindingConfig = {
  primarySheet: string;
  joinedSheet: string;
  linkSourceId: string;
  connectionPath: string[];
  selectedCandidateId: string;
  relationType: RelationType;
};
type SheetRelation = {
  id: string;
  sourceSheetId: string;
  sourceColumn: string;
  targetSheetId: string;
  targetColumn: string;
  relationType: RelationType;
  updateOption: "none";
  links: { sourceRowId: string; targetRowId: string }[];
};
type RelationDraft = {
  sourceSheetId: string;
  sourceColumn: string;
  targetSheetId: string;
  targetColumn: string;
  relationType: RelationType | "";
};
type CalculationOperator = "+" | "-" | "*" | "/";
type FormulaToken =
  | {
      kind: "field";
      sheetId: string;
      column: string;
      relationPath?: string[];
    }
  | { kind: "operator"; operator: CalculationOperator };
type ArithmeticCalculatedField = {
  id: string;
  kind?: "arithmetic";
  name: string;
  resultSheetId: string;
  relationIds: string[];
  formula: FormulaToken[];
};
type ConditionalOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isBlank"
  | "isNotBlank";
type ConditionalSumCondition = {
  id: string;
  sheetId?: string;
  relationPath?: string[];
  column: string;
  operator: ConditionalOperator;
  operand:
    | { kind: "literal"; value: string }
    | { kind: "currentRowField"; column: string };
};
type ConditionalSumField = {
  id: string;
  kind: "conditionalSum";
  name: string;
  resultSheetId: string;
  sourceSheetId: string;
  relationPath: string[];
  valueColumn: string;
  conditions: ConditionalSumCondition[];
};
type CalculatedField = ArithmeticCalculatedField | ConditionalSumField;
type CalculationDraft = {
  relationIds: string[];
  formula: FormulaToken[];
  name: string;
};
type ConditionalSumDraft = Omit<ConditionalSumField, "id" | "kind">;
type NewColumnDraft = {
  name: string;
  type: ColumnType;
};
type BuilderPage = {
  id: string;
  name: string;
  path: string;
  items: CanvasItem[];
};
type CanvasView = { x: number; y: number; zoom: number };
type ProjectSnapshot = {
  pages: BuilderPage[];
  activePageId: string;
  canvasView: CanvasView;
  sheets: Sheet[];
  dataBinding: DataBindingConfig;
  displayBindings: DisplayBindings;
  sheetRelations: SheetRelation[];
  calculatedFields: CalculatedField[];
};
type SavedProjectSnapshot = {
  id: string;
  projectVersion: number;
  reason: "manual" | "before_restore";
  createdAt: string;
};
type SheetDockMode = "normal" | "minimized" | "maximized";
type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const projectHistoryLimit = 100;
const projectHistoryInputDelay = 600;

function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProjectSnapshot>;
  return (
    Array.isArray(snapshot.pages) &&
    typeof snapshot.activePageId === "string" &&
    !!snapshot.canvasView &&
    Array.isArray(snapshot.sheets) &&
    !!snapshot.dataBinding &&
    !!snapshot.displayBindings &&
    Array.isArray(snapshot.sheetRelations) &&
    Array.isArray(snapshot.calculatedFields)
  );
}

function savedSnapshotTime(createdAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(createdAt));
}

const groups: {
  title: string;
  items: {
    kind: ComponentKind;
    name: string;
    caption: string;
    glyph: string;
  }[];
}[] = [
  {
    title: "입력",
    items: [
      {
        kind: "input",
        name: "입력창",
        caption: "텍스트나 숫자를 입력받아요",
        glyph: "T",
      },
      {
        kind: "radio",
        name: "라디오 선택",
        caption: "하나의 항목을 선택해요",
        glyph: "◉",
      },
      {
        kind: "search",
        name: "검색창",
        caption: "목록에서 원하는 값을 찾아요",
        glyph: "⌕",
      },
    ],
  },
  {
    title: "표시",
    items: [
      {
        kind: "text",
        name: "텍스트",
        caption: "제목이나 안내문을 표시해요",
        glyph: "Aa",
      },
      {
        kind: "table",
        name: "테이블",
        caption: "여러 데이터를 표로 보여줘요",
        glyph: "▦",
      },
      {
        kind: "pagination",
        name: "페이지네이션",
        caption: "목록의 페이지를 이동해요",
        glyph: "···",
      },
    ],
  },
  {
    title: "동작과 로직",
    items: [
      {
        kind: "button",
        name: "버튼",
        caption: "클릭하면 작업을 실행해요",
        glyph: "↗",
      },
      {
        kind: "condition",
        name: "조건",
        caption: "조건에 따라 UI를 보여줘요",
        glyph: "⑂",
      },
    ],
  },
];

const initialItems: CanvasItem[] = [
  {
    id: "heading",
    kind: "text",
    label: "LCA 데이터 정제",
    subtitle: "STG 원천 데이터가 DIM 기준정보와 FACT 실적으로 정제됩니다.",
    showSubtitle: true,
  },
  { id: "search", kind: "search", label: "자재 검색" },
  { id: "add", kind: "button", label: "데이터 추가" },
  { id: "table", kind: "table", label: "정제 데이터" },
  { id: "pagination", kind: "pagination", label: "페이지 이동" },
];

const initialSheets: Sheet[] = [
  {
    id: "stg-source",
    name: "STG · 원천 수집",
    columns: [
      "배치 번호",
      "원천 시스템",
      "플랜트 코드",
      "자재 번호",
      "원천 값",
      "단위",
      "상태",
    ],
    columnTypes: ["number", "text", "text", "text", "number", "text", "text"],
    rowIds: ["stg-row-1", "stg-row-2", "stg-row-3", "stg-row-4"],
    rows: [
      ["1042", "SAP_MM", "1100", "RM-1001", "1240.5", "KG", "수집 완료"],
      ["1042", "SAP_MM", "1100", "PM-2001", "780", "EA", "수집 완료"],
      ["1042", "SAP_CO", "1200", "RM-1002", "956.8", "KG", "수집 완료"],
      ["1042", "SAP_CO", "1200", "RM-1001", "632.4", "KG", "수집 완료"],
    ],
  },
  {
    id: "dim-master",
    name: "DIM · 기준정보",
    columns: [
      "자재 ID",
      "자재 번호",
      "자재명",
      "자재 유형",
      "사업장 ID",
      "사업장명",
    ],
    columnTypes: ["number", "text", "text", "text", "number", "text"],
    rowIds: ["dim-row-1", "dim-row-2", "dim-row-3", "dim-row-4"],
    rows: [
      ["101", "RM-1001", "재생 알루미늄", "원재료", "11", "울산 1공장"],
      ["102", "RM-1002", "폴리올 수지", "원재료", "12", "대전 2공장"],
      ["103", "PM-2001", "완충 포장재", "반제품", "11", "울산 1공장"],
      ["104", "FG-3001", "친환경 패널", "완제품", "12", "대전 2공장"],
    ],
  },
  {
    id: "fact-flow",
    name: "FACT · 정제 실적",
    columns: [
      "기간",
      "사업장 ID",
      "자재 ID",
      "자재 번호",
      "실적 유형",
      "수량",
      "단위",
    ],
    columnTypes: ["text", "number", "number", "text", "text", "number", "text"],
    rowIds: ["fact-row-1", "fact-row-2", "fact-row-3", "fact-row-4"],
    rows: [
      ["202607", "11", "101", "RM-1001", "물질 투입", "1240.5", "KG"],
      ["202607", "11", "103", "PM-2001", "포장재 투입", "780", "EA"],
      ["202607", "12", "102", "RM-1002", "물질 투입", "956.8", "KG"],
      ["202607", "12", "101", "RM-1001", "물질 투입", "632.4", "KG"],
    ],
  },
];
const emptySheet: Sheet = {
  id: "",
  name: "",
  columns: [],
  rowIds: [],
  rows: [],
};

const initialDataBinding: DataBindingConfig = {
  primarySheet: "stg-source",
  joinedSheet: "dim-master",
  linkSourceId: "stg-source",
  connectionPath: ["stg-source", "dim-master"],
  selectedCandidateId: "stg-source:3-dim-master:1",
  relationType: "N:1",
};
const blankDataBinding: DataBindingConfig = {
  primarySheet: "",
  joinedSheet: "",
  linkSourceId: "",
  connectionPath: [],
  selectedCandidateId: "",
  relationType: "N:1",
};
const initialSheetRelations: SheetRelation[] = [
  {
    id: "relation-stg-dim-material",
    sourceSheetId: "stg-source",
    sourceColumn: "자재 번호",
    targetSheetId: "dim-master",
    targetColumn: "자재 번호",
    relationType: "N:1",
    updateOption: "none",
    links: [
      { sourceRowId: "stg-row-1", targetRowId: "dim-row-1" },
      { sourceRowId: "stg-row-2", targetRowId: "dim-row-3" },
      { sourceRowId: "stg-row-3", targetRowId: "dim-row-2" },
      { sourceRowId: "stg-row-4", targetRowId: "dim-row-1" },
    ],
  },
  {
    id: "relation-dim-fact-material",
    sourceSheetId: "dim-master",
    sourceColumn: "자재 ID",
    targetSheetId: "fact-flow",
    targetColumn: "자재 ID",
    relationType: "1:N",
    updateOption: "none",
    links: [
      { sourceRowId: "dim-row-1", targetRowId: "fact-row-1" },
      { sourceRowId: "dim-row-1", targetRowId: "fact-row-4" },
      { sourceRowId: "dim-row-2", targetRowId: "fact-row-3" },
      { sourceRowId: "dim-row-3", targetRowId: "fact-row-2" },
    ],
  },
];
const initialPages: BuilderPage[] = [
  {
    id: "lca-page",
    name: "LCA 정제",
    path: "/lca-data",
    items: initialItems,
  },
];
const blankPages: BuilderPage[] = [
  { id: "page-1", name: "첫 화면", path: "/", items: [] },
];
const resizeDirections: ResizeDirection[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

function defaultItemWidth(kind: ComponentKind) {
  if (kind === "button") return 150;
  if (kind === "search") return 700;
  if (kind === "pagination") return 250;
  if (kind === "input" || kind === "radio" || kind === "condition") return 360;
  return 928;
}

function defaultItemHeight(kind: ComponentKind) {
  if (kind === "table") return 180;
  if (kind === "text" || kind === "radio" || kind === "condition") return 70;
  return 44;
}

function defaultItemPosition(index: number) {
  const presets = [
    { x: 0, y: 0 },
    { x: 0, y: 90 },
    { x: 778, y: 90 },
    { x: 0, y: 150 },
    { x: 678, y: 395 },
  ];
  return presets[index] ?? { x: 0, y: 470 + (index - presets.length) * 90 };
}

function detectJoinCandidates(left: Sheet, right: Sheet): JoinCandidate[] {
  const candidates: JoinCandidate[] = [];
  left.columns.forEach((leftName, leftColumn) => {
    const leftValues = new Set(
      left.rows.map((row) => row[leftColumn]).filter(Boolean),
    );
    right.columns.forEach((rightName, rightColumn) => {
      const matches = [
        ...new Set(
          right.rows
            .map((row) => row[rightColumn])
            .filter((value) => leftValues.has(value)),
        ),
      ];
      if (matches.length === 0) return;
      const identifierLike =
        /id|번호/i.test(leftName) ||
        /id|번호/i.test(rightName) ||
        matches.every((value) => /\d/.test(value));
      candidates.push({
        id: `${left.id}:${leftColumn}-${right.id}:${rightColumn}`,
        leftColumn,
        rightColumn,
        kind: identifierLike ? "number" : "text",
        matches,
      });
    });
  });
  return candidates.sort(
    (a, b) =>
      (a.kind === "number" ? -1 : 1) - (b.kind === "number" ? -1 : 1) ||
      b.matches.length - a.matches.length,
  );
}

function buildRelationLinks(
  relation: Omit<SheetRelation, "links">,
  sheets: Sheet[],
) {
  const source = sheets.find((sheet) => sheet.id === relation.sourceSheetId);
  const target = sheets.find((sheet) => sheet.id === relation.targetSheetId);
  if (!source || !target) return [];
  const sourceColumn = source.columns.indexOf(relation.sourceColumn);
  const targetColumn = target.columns.indexOf(relation.targetColumn);
  if (sourceColumn < 0 || targetColumn < 0) return [];
  return source.rows.flatMap((sourceRow, sourceIndex) =>
    target.rows.flatMap((targetRow, targetIndex) =>
      sourceRow[sourceColumn] &&
      sourceRow[sourceColumn] === targetRow[targetColumn]
        ? [
            {
              sourceRowId: source.rowIds[sourceIndex],
              targetRowId: target.rowIds[targetIndex],
            },
          ]
        : [],
    ),
  );
}

function parseNumericValue(value: string) {
  if (/년|월|일/.test(value)) return null;
  const normalized = value.replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) ? number : null;
}

function numericColumns(sheet: Sheet) {
  return sheet.columns.filter((_, columnIndex) => {
    const configuredType = sheet.columnTypes?.[columnIndex];
    if (configuredType) return configuredType === "number";
    return sheet.rows.some(
      (row) => parseNumericValue(row[columnIndex] ?? "") !== null,
    );
  });
}

function columnType(sheet: Sheet, columnIndex: number): ColumnType {
  const configuredType = sheet.columnTypes?.[columnIndex];
  if (configuredType) return configuredType;
  const column = sheet.columns[columnIndex] ?? "";
  const values = sheet.rows.map((row) => row[columnIndex] ?? "");
  if (/날짜|일자|가입일|생성일/.test(column)) return "date";
  if (
    values.some((value) => value !== "") &&
    values.every((value) => value === "" || /^(예|아니오)$/.test(value))
  )
    return "boolean";
  if (values.some((value) => parseNumericValue(value) !== null))
    return "number";
  return "text";
}

const columnTypeOptions: {
  type: ColumnType;
  label: string;
  description: string;
  icon: string;
}[] = [
  { type: "text", label: "글자", description: "이름이나 설명", icon: "T" },
  { type: "number", label: "숫자", description: "수량이나 금액", icon: "123" },
  { type: "date", label: "날짜", description: "일정이나 기록일", icon: "▣" },
  {
    type: "boolean",
    label: "예/아니오",
    description: "두 가지 상태",
    icon: "✓",
  },
];

function columnTypeLabel(type: ColumnType) {
  return (
    columnTypeOptions.find((option) => option.type === type)?.label ?? "글자"
  );
}

type ReachableSheet = {
  sheet: Sheet;
  relationPath: string[];
};

function isConditionalSumField(
  field: CalculatedField,
): field is ConditionalSumField {
  return field.kind === "conditionalSum";
}

function conditionalOperatorLabel(operator: ConditionalOperator) {
  return {
    eq: "같음",
    neq: "다름",
    gt: "보다 큼",
    gte: "이상",
    lt: "보다 작음",
    lte: "이하",
    isBlank: "비어 있음",
    isNotBlank: "비어 있지 않음",
  }[operator];
}

function calculatedFieldRelationIds(field: CalculatedField) {
  return isConditionalSumField(field)
    ? [
        ...new Set([
          ...field.relationPath,
          ...field.conditions.flatMap(
            (condition) => condition.relationPath ?? [],
          ),
        ]),
      ]
    : field.relationIds;
}

function relationAllowsSingleRowFrom(
  relation: SheetRelation,
  fromSheetId: string,
) {
  if (relation.sourceSheetId === fromSheetId)
    return relation.relationType === "1:1" || relation.relationType === "N:1";
  if (relation.targetSheetId === fromSheetId)
    return relation.relationType === "1:1" || relation.relationType === "1:N";
  return false;
}

function relationHasAtMostOneLinkFrom(
  relation: SheetRelation,
  fromSheetId: string,
  sheets: Sheet[],
) {
  const counts = new Map<string, number>();
  buildRelationLinks(relation, sheets).forEach((link) => {
    const rowId =
      relation.sourceSheetId === fromSheetId
        ? link.sourceRowId
        : link.targetRowId;
    counts.set(rowId, (counts.get(rowId) ?? 0) + 1);
  });
  return [...counts.values()].every((count) => count <= 1);
}

function reachableSheetsFrom(
  startSheet: Sheet,
  relations: SheetRelation[],
  sheets: Sheet[],
) {
  const result: ReachableSheet[] = [{ sheet: startSheet, relationPath: [] }];
  const visited = new Set([startSheet.id]);
  for (let index = 0; index < result.length; index++) {
    const current = result[index];
    relations.forEach((relation) => {
      if (
        !relationAllowsSingleRowFrom(relation, current.sheet.id) ||
        !relationHasAtMostOneLinkFrom(relation, current.sheet.id, sheets)
      )
        return;
      const nextSheetId =
        relation.sourceSheetId === current.sheet.id
          ? relation.targetSheetId
          : relation.sourceSheetId;
      if (visited.has(nextSheetId)) return;
      const nextSheet = sheets.find((sheet) => sheet.id === nextSheetId);
      if (!nextSheet) return;
      visited.add(nextSheetId);
      result.push({
        sheet: nextSheet,
        relationPath: [...current.relationPath, relation.id],
      });
    });
  }
  return result;
}

function aggregateReachableSheetsFrom(
  startSheet: Sheet,
  relations: SheetRelation[],
  sheets: Sheet[],
) {
  const result: ReachableSheet[] = [{ sheet: startSheet, relationPath: [] }];
  const visited = new Set([startSheet.id]);
  for (let index = 0; index < result.length; index++) {
    const current = result[index];
    relations.forEach((relation) => {
      if (
        relation.sourceSheetId !== current.sheet.id &&
        relation.targetSheetId !== current.sheet.id
      )
        return;
      const nextSheetId =
        relation.sourceSheetId === current.sheet.id
          ? relation.targetSheetId
          : relation.sourceSheetId;
      if (visited.has(nextSheetId)) return;
      const nextSheet = sheets.find((sheet) => sheet.id === nextSheetId);
      if (!nextSheet) return;
      visited.add(nextSheetId);
      result.push({
        sheet: nextSheet,
        relationPath: [...current.relationPath, relation.id],
      });
    });
  }
  return result;
}

function traverseRelatedRows(
  startSheetId: string,
  startRowId: string,
  relationPath: string[],
  relations: SheetRelation[],
  sheets: Sheet[],
) {
  let currentSheetId = startSheetId;
  let currentRowIds = [startRowId];
  for (const relationId of relationPath) {
    const relation = relations.find((item) => item.id === relationId);
    if (
      !relation ||
      (relation.sourceSheetId !== currentSheetId &&
        relation.targetSheetId !== currentSheetId)
    )
      return { sheetId: currentSheetId, rowIds: [] };
    const fromSource = relation.sourceSheetId === currentSheetId;
    const rowIds = new Set(currentRowIds);
    const currentLinks = buildRelationLinks(relation, sheets);
    currentRowIds = [
      ...new Set(
        currentLinks.flatMap((link) => {
          const fromRowId = fromSource ? link.sourceRowId : link.targetRowId;
          if (!rowIds.has(fromRowId)) return [];
          return [fromSource ? link.targetRowId : link.sourceRowId];
        }),
      ),
    ];
    currentSheetId = fromSource
      ? relation.targetSheetId
      : relation.sourceSheetId;
  }
  return { sheetId: currentSheetId, rowIds: currentRowIds };
}

function compareConditionalValues(
  left: string,
  operator: ConditionalOperator,
  right: string,
) {
  if (operator === "isBlank") return left.trim() === "";
  if (operator === "isNotBlank") return left.trim() !== "";
  const leftNumber = parseNumericValue(left);
  const rightNumber = parseNumericValue(right);
  const numeric = leftNumber !== null && rightNumber !== null;
  const comparison = numeric
    ? leftNumber - rightNumber
    : left.localeCompare(right, "ko-KR", { sensitivity: "base" });
  if (operator === "eq") return comparison === 0;
  if (operator === "neq") return comparison !== 0;
  if (operator === "gt") return comparison > 0;
  if (operator === "gte") return comparison >= 0;
  if (operator === "lt") return comparison < 0;
  return comparison <= 0;
}

function relationPathStartsWith(path: string[], prefix: string[]) {
  return (
    path.length >= prefix.length &&
    prefix.every((relationId, index) => path[index] === relationId)
  );
}

function conditionRowsForAggregateRow(
  field: ConditionalSumField,
  condition: ConditionalSumCondition,
  aggregateRowId: string,
  resultRowId: string,
  relations: SheetRelation[],
  sheets: Sheet[],
) {
  const conditionPath = condition.relationPath ?? field.relationPath;
  if (relationPathStartsWith(conditionPath, field.relationPath))
    return traverseRelatedRows(
      field.sourceSheetId,
      aggregateRowId,
      conditionPath.slice(field.relationPath.length),
      relations,
      sheets,
    );
  return traverseRelatedRows(
    field.resultSheetId,
    resultRowId,
    conditionPath,
    relations,
    sheets,
  );
}

function calculateConditionalSum(
  field: ConditionalSumField,
  relations: SheetRelation[],
  sheets: Sheet[],
  resultRowId: string,
) {
  const resultSheet = sheets.find((sheet) => sheet.id === field.resultSheetId);
  const sourceSheet = sheets.find((sheet) => sheet.id === field.sourceSheetId);
  if (!resultSheet || !sourceSheet) return "연결 없음";
  const traversed = traverseRelatedRows(
    field.resultSheetId,
    resultRowId,
    field.relationPath,
    relations,
    sheets,
  );
  if (traversed.sheetId !== field.sourceSheetId) return "연결 없음";
  const resultRowIndex = resultSheet.rowIds.indexOf(resultRowId);
  let total = 0;
  for (const rowId of traversed.rowIds) {
    const rowIndex = sourceSheet.rowIds.indexOf(rowId);
    const row = sourceSheet.rows[rowIndex];
    if (!row) continue;
    const matches = field.conditions.every((condition) => {
      const conditionSheetId = condition.sheetId ?? field.sourceSheetId;
      const conditionSheet = sheets.find(
        (sheet) => sheet.id === conditionSheetId,
      );
      if (!conditionSheet) return false;
      const conditionRows = conditionRowsForAggregateRow(
        field,
        condition,
        rowId,
        resultRowId,
        relations,
        sheets,
      );
      if (conditionRows.sheetId !== conditionSheetId) return false;
      const right =
        condition.operand.kind === "literal"
          ? condition.operand.value
          : (resultSheet.rows[resultRowIndex]?.[
              resultSheet.columns.indexOf(condition.operand.column)
            ] ?? "");
      return conditionRows.rowIds.some((conditionRowId) => {
        const conditionRowIndex = conditionSheet.rowIds.indexOf(conditionRowId);
        const left =
          conditionSheet.rows[conditionRowIndex]?.[
            conditionSheet.columns.indexOf(condition.column)
          ] ?? "";
        return compareConditionalValues(left, condition.operator, right);
      });
    });
    if (!matches) continue;
    const value = parseNumericValue(
      row[sourceSheet.columns.indexOf(field.valueColumn)] ?? "",
    );
    if (value === null) return "숫자 필요";
    total += value;
  }
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    total,
  );
}

function relationPathLabel(
  startSheet: Sheet,
  relationPath: string[],
  relations: SheetRelation[],
  sheets: Sheet[],
) {
  const names = [startSheet.name];
  let currentSheetId = startSheet.id;
  relationPath.forEach((relationId) => {
    const relation = relations.find((item) => item.id === relationId);
    if (!relation) return;
    currentSheetId =
      relation.sourceSheetId === currentSheetId
        ? relation.targetSheetId
        : relation.sourceSheetId;
    const sheet = sheets.find((item) => item.id === currentSheetId);
    if (sheet) names.push(sheet.name);
  });
  return names.join(" → ");
}

function calculateFieldValue(
  field: CalculatedField,
  relations: SheetRelation[],
  sheets: Sheet[],
  resultRowId: string,
  calculatedFields: CalculatedField[] = [],
  resolvingFieldIds: Set<string> = new Set(),
): string {
  if (resolvingFieldIds.has(field.id)) return "순환 참조";
  const nextResolvingFieldIds = new Set(resolvingFieldIds).add(field.id);
  if (isConditionalSumField(field))
    return calculateConditionalSum(field, relations, sheets, resultRowId);
  const resultSheet = sheets.find((sheet) => sheet.id === field.resultSheetId);
  const values: number[] = [];
  const operators: CalculationOperator[] = [];
  const precedence = (operator: CalculationOperator) =>
    operator === "*" || operator === "/" ? 2 : 1;
  const applyTop = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (!operator || left === undefined || right === undefined) return false;
    if (operator === "/" && right === 0) return false;
    values.push(
      operator === "+"
        ? left + right
        : operator === "-"
          ? left - right
          : operator === "*"
            ? left * right
            : left / right,
    );
    return true;
  };
  for (const token of field.formula) {
    if (token.kind === "operator") {
      while (
        operators.length &&
        precedence(operators.at(-1)!) >= precedence(token.operator)
      ) {
        if (!applyTop()) return "계산 불가";
      }
      operators.push(token.operator);
      continue;
    }
    const sheet =
      token.sheetId === field.resultSheetId
        ? resultSheet
        : sheets.find((item) => item.id === token.sheetId);
    if (!sheet) return "연결 없음";
    let currentSheetId = field.resultSheetId;
    let currentRowId = resultRowId;
    const relationPath =
      token.relationPath ??
      (token.sheetId === field.resultSheetId
        ? []
        : [
            relations.find(
              (item) =>
                (item.sourceSheetId === field.resultSheetId &&
                  item.targetSheetId === token.sheetId) ||
                (item.targetSheetId === field.resultSheetId &&
                  item.sourceSheetId === token.sheetId),
            )?.id ?? "",
          ]);
    for (const relationId of relationPath) {
      const relation = relations.find((item) => item.id === relationId);
      if (
        !relation ||
        (relation.sourceSheetId !== currentSheetId &&
          relation.targetSheetId !== currentSheetId)
      )
        return "연결 없음";
      const currentLinks = buildRelationLinks(relation, sheets);
      const relatedRowIds =
        relation.sourceSheetId === currentSheetId
          ? currentLinks
              .filter((link) => link.sourceRowId === currentRowId)
              .map((link) => link.targetRowId)
          : currentLinks
              .filter((link) => link.targetRowId === currentRowId)
              .map((link) => link.sourceRowId);
      if (relatedRowIds.length > 1) return "계산 불가";
      currentRowId = relatedRowIds[0] ?? "";
      currentSheetId =
        relation.sourceSheetId === currentSheetId
          ? relation.targetSheetId
          : relation.sourceSheetId;
    }
    if (currentSheetId !== token.sheetId) return "연결 없음";
    const rowIndex = sheet.rowIds.indexOf(currentRowId);
    const referencedField = calculatedFields.find(
      (item) =>
        item.resultSheetId === token.sheetId && item.name === token.column,
    );
    const rawValue: string = referencedField
      ? calculateFieldValue(
          referencedField,
          relations,
          sheets,
          currentRowId,
          calculatedFields,
          nextResolvingFieldIds,
        )
      : (sheet?.rows[rowIndex]?.[sheet.columns.indexOf(token.column)] ?? "");
    if (rawValue === "순환 참조") return rawValue;
    const number = parseNumericValue(rawValue);
    if (number === null) return "숫자 필요";
    values.push(number);
  }
  while (operators.length) if (!applyTop()) return "계산 불가";
  const result = values[0];
  if (result === undefined || !Number.isFinite(result)) return "계산 불가";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    result,
  );
}

function RenderItem({
  item,
  sheets,
  sheetRelations,
  calculatedFields,
  binding,
}: {
  item: CanvasItem;
  sheets: Sheet[];
  sheetRelations: SheetRelation[];
  calculatedFields: CalculatedField[];
  binding?: DisplayBinding;
}) {
  const sheet = sheets.find((candidate) => candidate.id === binding?.sheetId);
  const rowIndex = sheet?.rowIds.indexOf(binding?.rowId ?? "") ?? -1;
  const row = sheet?.rows[rowIndex >= 0 ? rowIndex : 0];
  const fieldIndex = sheet?.columns.indexOf(binding?.field ?? "") ?? -1;
  const boundText = row && fieldIndex >= 0 ? row[fieldIndex] : "";
  if (item.kind === "text")
    return (
      <div className="mock-heading">
        <h2 style={{ fontSize: `${item.fontSize ?? 17}px` }}>
          {boundText || item.label}
        </h2>
        {item.showSubtitle !== false && (
          <p>{item.subtitle ?? "고객 정보와 이용 상태를 한눈에 관리하세요."}</p>
        )}
      </div>
    );
  if (item.kind === "search")
    return (
      <label className="mock-search">
        <Icons.search />
        <input placeholder="이름, 이메일로 검색" readOnly />
      </label>
    );
  if (item.kind === "button")
    return (
      <button className="mock-primary" type="button">
        <Icons.plus />
        {item.label}
      </button>
    );
  if (item.kind === "input")
    return (
      <label className="mock-field">
        <span>{item.label}</span>
        <input placeholder="내용을 입력하세요" readOnly />
      </label>
    );
  if (item.kind === "radio")
    return (
      <fieldset className="mock-radio">
        <legend>{item.label}</legend>
        <label>
          <input type="radio" name={item.id} defaultChecked /> 활성
        </label>
        <label>
          <input type="radio" name={item.id} /> 비활성
        </label>
      </fieldset>
    );
  if (item.kind === "condition")
    return (
      <div className="mock-condition">
        <span>IF</span>
        <div>
          <strong>{item.label}</strong>
          <small>상태가 활성일 때 표시</small>
        </div>
      </div>
    );
  if (item.kind === "pagination")
    return (
      <nav className="mock-pagination" aria-label="페이지 이동">
        <button>‹</button>
        <button className="active">1</button>
        <button>2</button>
        <button>3</button>
        <button>›</button>
      </nav>
    );
  const sheetCalculatedFields = calculatedFields.filter(
    (field) => field.resultSheetId === sheet?.id,
  );
  const tableFields =
    binding?.fields.filter(
      (field) =>
        sheet?.columns.includes(field) ||
        sheetCalculatedFields.some((calculated) => calculated.name === field),
    ) ?? [];
  if (sheet && tableFields.length > 0)
    return (
      <div className="mock-table-wrap">
        <table className="mock-table bound-table">
          <thead>
            <tr>
              {tableFields.map((field) => {
                const calculated = sheetCalculatedFields.some(
                  (item) => item.name === field,
                );
                return (
                  <th key={field}>
                    {calculated && <span className="table-fx-badge">fx</span>}
                    {field}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((sheetRow, index) => (
              <tr key={sheet.rowIds[index] ?? index}>
                {tableFields.map((field) => {
                  const calculated = sheetCalculatedFields.find(
                    (item) => item.name === field,
                  );
                  return (
                    <td key={field}>
                      {calculated
                        ? calculateFieldValue(
                            calculated,
                            sheetRelations,
                            sheets,
                            sheet.rowIds[index],
                            calculatedFields,
                          )
                        : sheetRow[sheet.columns.indexOf(field)]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="mock-table-wrap unbound-display">
      <strong>{item.label}</strong>
      <span>데이터 탭에서 시트를 연결하세요</span>
    </div>
  );
}

function ComponentDataPanel({
  item,
  sheets,
  calculatedFields,
  binding,
  onChange,
  onRemove,
}: {
  item: CanvasItem;
  sheets: Sheet[];
  calculatedFields: CalculatedField[];
  binding?: DisplayBinding;
  onChange: (binding: DisplayBinding) => void;
  onRemove: () => void;
}) {
  if (sheets.length === 0)
    return (
      <div className="empty-data-binding">
        <Icons.database />
        <strong>연결할 데이터 시트가 없습니다</strong>
        <p>아래 데이터 영역에서 새 시트를 만들어주세요.</p>
      </div>
    );
  const selectedSheet =
    sheets.find((sheet) => sheet.id === binding?.sheetId) ?? sheets[0];
  const normalized: DisplayBinding = binding ?? {
    sheetId: selectedSheet.id,
    field: selectedSheet.columns[0] ?? "",
    fields: selectedSheet.columns.slice(0, 5),
    rowId: selectedSheet.rowIds[0] ?? "",
  };
  const update = (patch: Partial<DisplayBinding>) =>
    onChange({ ...normalized, ...patch });
  const isTable = item.kind === "table";
  const selectedCalculatedFields = calculatedFields.filter(
    (field) => field.resultSheetId === selectedSheet.id,
  );

  function changeSheet(sheetId: string) {
    const next = sheets.find((sheet) => sheet.id === sheetId) ?? sheets[0];
    onChange({
      sheetId: next.id,
      field: next.columns[0] ?? "",
      fields: next.columns.slice(0, 5),
      rowId: next.rowIds[0] ?? "",
    });
  }

  function toggleField(field: string) {
    const fields = normalized.fields.includes(field)
      ? normalized.fields.filter((value) => value !== field)
      : [...normalized.fields, field];
    update({ fields });
  }

  return (
    <div className="component-data-panel">
      <section>
        <div className="data-source-title">
          <div>
            <Icons.database />
            <span>
              <strong>데이터 시트 연결</strong>
              <small>시트 값이 바뀌면 화면도 바로 바뀝니다.</small>
            </span>
          </div>
          {binding && <em>연결됨</em>}
        </div>
        <label>
          가져올 시트
          <select
            value={selectedSheet.id}
            onChange={(event) => changeSheet(event.target.value)}
          >
            {sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name} · {sheet.rows.length}개
              </option>
            ))}
          </select>
        </label>
      </section>
      {isTable ? (
        <section>
          <h3>테이블에 표시할 필드</h3>
          <div className="display-field-list">
            {selectedSheet.columns.map((field, index) => (
              <label
                key={field}
                className={normalized.fields.includes(field) ? "active" : ""}
              >
                <input
                  type="checkbox"
                  checked={normalized.fields.includes(field)}
                  onChange={() => toggleField(field)}
                />
                <span>
                  <b>#{index + 1}</b>
                  {field}
                </span>
              </label>
            ))}
            {selectedCalculatedFields.map((field) => (
              <label
                key={field.id}
                className={
                  normalized.fields.includes(field.name) ? "active" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={normalized.fields.includes(field.name)}
                  onChange={() => toggleField(field.name)}
                />
                <span>
                  <b className="fx">fx</b>
                  {field.name}
                </span>
              </label>
            ))}
          </div>
          <p className="binding-preview">
            <Icons.check />
            {selectedSheet.name}의 데이터 {selectedSheet.rows.length}개를{" "}
            {normalized.fields.length}개 필드로 표시합니다.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h3>표시할 값</h3>
            <label>
              데이터 행
              <select
                value={normalized.rowId}
                onChange={(event) => update({ rowId: event.target.value })}
              >
                {selectedSheet.rows.map((row, index) => (
                  <option
                    key={selectedSheet.rowIds[index]}
                    value={selectedSheet.rowIds[index]}
                  >
                    {index + 1}번 데이터 · {row[1] || row[0]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              표시할 필드
              <select
                value={normalized.field}
                onChange={(event) => update({ field: event.target.value })}
              >
                {selectedSheet.columns.map((field, index) => (
                  <option key={field} value={field}>
                    #{index + 1} {field}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section>
            <h3>화면에 보일 값</h3>
            <div className="text-value-preview">
              {selectedSheet.rows[
                selectedSheet.rowIds.indexOf(normalized.rowId)
              ]?.[selectedSheet.columns.indexOf(normalized.field)] || "빈 값"}
            </div>
          </section>
        </>
      )}
      <button className="remove-binding" disabled={!binding} onClick={onRemove}>
        연결 해제
      </button>
    </div>
  );
}

function DataBindingPanel({
  sheets,
  config,
  onChange,
}: {
  sheets: Sheet[];
  config: DataBindingConfig;
  onChange: (config: DataBindingConfig) => void;
}) {
  const {
    primarySheet,
    joinedSheet,
    linkSourceId,
    connectionPath,
    selectedCandidateId,
    relationType,
  } = config;
  const updateConfig = (patch: Partial<DataBindingConfig>) =>
    onChange({ ...config, ...patch });
  const primary =
    sheets.find((sheet) => sheet.id === primarySheet) ?? sheets[0];
  const linkSource =
    sheets.find((sheet) => sheet.id === linkSourceId) ?? primary;
  const joined =
    sheets.find((sheet) => sheet.id === joinedSheet) ?? sheets[1] ?? sheets[0];
  const primaryLabel = linkSource.name;
  const joinedLabel = joined.name;
  const candidates = detectJoinCandidates(linkSource, joined);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates[0];
  const internalLinks = selectedCandidate
    ? linkSource.rows.flatMap((leftRow, leftIndex) =>
        joined.rows.flatMap((rightRow, rightIndex) =>
          leftRow[selectedCandidate.leftColumn] ===
          rightRow[selectedCandidate.rightColumn]
            ? [
                {
                  leftRowId: linkSource.rowIds[leftIndex],
                  rightRowId: joined.rowIds[rightIndex],
                },
              ]
            : [],
        ),
      )
    : [];
  const availableSheets = sheets.filter(
    (sheet) => !connectionPath.includes(sheet.id),
  );

  function editConnection(index: number) {
    updateConfig({
      linkSourceId: connectionPath[index],
      joinedSheet: connectionPath[index + 1],
      selectedCandidateId: "",
    });
  }

  function addConnection() {
    const next = availableSheets[0];
    if (!next) return;
    const sourceId = connectionPath.at(-1) ?? primarySheet;
    updateConfig({
      linkSourceId: sourceId,
      joinedSheet: next.id,
      connectionPath: [...connectionPath, next.id],
      selectedCandidateId: "",
    });
  }
  const primaryHasMany = relationType === "1:N" || relationType === "N:N";
  const joinedHasMany = relationType === "N:1" || relationType === "N:N";

  function updateRelationship(
    nextPrimaryHasMany: boolean,
    nextJoinedHasMany: boolean,
  ) {
    if (nextPrimaryHasMany && nextJoinedHasMany)
      updateConfig({ relationType: "N:N" });
    else if (nextPrimaryHasMany) updateConfig({ relationType: "1:N" });
    else if (nextJoinedHasMany) updateConfig({ relationType: "N:1" });
    else updateConfig({ relationType: "1:1" });
  }

  return (
    <div className="binding-panel">
      <section>
        <h3>가져올 데이터</h3>
        <label>
          기준 시트
          <select
            value={primarySheet}
            onChange={(event) =>
              updateConfig({
                primarySheet: event.target.value,
                linkSourceId: event.target.value,
                connectionPath: [event.target.value],
                selectedCandidateId: "",
              })
            }
          >
            {sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-picks">
          {primary.columns.map((column, index) => (
            <label key={column}>
              <input type="checkbox" defaultChecked={index < 5} />
              <span>{column}</span>
            </label>
          ))}
        </div>
      </section>
      <section>
        <div className="binding-title">
          <h3>연결된 시트</h3>
          <span>{connectionPath.length}개</span>
        </div>
        <div className="connection-path">
          {connectionPath.map((sheetId, index) => {
            const sheet = sheets.find((item) => item.id === sheetId);
            return (
              <div key={sheetId}>
                {index > 0 && (
                  <button
                    className={
                      linkSourceId === connectionPath[index - 1] &&
                      joinedSheet === sheetId
                        ? "active edge"
                        : "edge"
                    }
                    onClick={() => editConnection(index - 1)}
                  >
                    →
                  </button>
                )}
                <span className={sheetId === joinedSheet ? "active" : ""}>
                  <Icons.database />
                  {sheet?.name}
                </span>
              </div>
            );
          })}
        </div>
        <button
          className="add-connection"
          onClick={addConnection}
          disabled={availableSheets.length === 0}
        >
          <Icons.plus />
          {availableSheets.length > 0
            ? "시트 추가 연결"
            : "모든 시트가 연결됐어요"}
        </button>
      </section>
      <section>
        <div className="binding-title">
          <h3>
            {primaryLabel}과 {joinedLabel} 연결
          </h3>
        </div>
        <div className="connection-suggestion">
          <Icons.sparkles />
          <div>
            <strong>연결할 수 있는 값을 찾았어요</strong>
            <small>겹치는 숫자와 텍스트를 자동으로 비교했습니다.</small>
          </div>
        </div>
        {candidates.length > 0 ? (
          <div className="match-candidates">
            {candidates.map((candidate, index) => (
              <button
                key={candidate.id}
                className={
                  selectedCandidate?.id === candidate.id ? "active" : ""
                }
                onClick={() =>
                  updateConfig({ selectedCandidateId: candidate.id })
                }
              >
                <span>
                  <Icons.check />
                </span>
                <div>
                  <strong>
                    {linkSource.columns[candidate.leftColumn]} ↔{" "}
                    {joined.columns[candidate.rightColumn]}
                  </strong>
                  <small>
                    {candidate.kind === "number"
                      ? "겹치는 번호"
                      : "겹치는 텍스트"}{" "}
                    {candidate.matches.length}개 ·{" "}
                    {candidate.matches.slice(0, 2).join(", ")}
                  </small>
                </div>
                <em>{index === 0 ? "추천" : "가능"}</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="no-match">
            겹치는 값을 찾지 못했어요. 다른 시트를 선택해보세요.
          </div>
        )}
        <div className="relationship-questions">
          <div>
            <strong>
              {primaryLabel} 한 명에게 {joinedLabel}이 여러 개 생길 수 있나요?
            </strong>
            <span>
              <button
                className={primaryHasMany ? "active" : ""}
                onClick={() => updateRelationship(true, joinedHasMany)}
              >
                예, 여러 개
              </button>
              <button
                className={!primaryHasMany ? "active" : ""}
                onClick={() => updateRelationship(false, joinedHasMany)}
              >
                아니요, 하나만
              </button>
            </span>
          </div>
          <div>
            <strong>
              {joinedLabel} 하나가 {primaryLabel} 여러 명에게 속할 수 있나요?
            </strong>
            <span>
              <button
                className={joinedHasMany ? "active" : ""}
                onClick={() => updateRelationship(primaryHasMany, true)}
              >
                예, 여러 개
              </button>
              <button
                className={!joinedHasMany ? "active" : ""}
                onClick={() => updateRelationship(primaryHasMany, false)}
              >
                아니요, 한 명에게만
              </button>
            </span>
          </div>
        </div>
        <div className="relationship-summary">
          <Icons.check />
          <p>
            <strong>
              {primaryHasMany
                ? `${primaryLabel} 한 명은 ${joinedLabel}을 여러 개 가질 수 있고`
                : `${primaryLabel} 한 명은 ${joinedLabel} 하나와 연결되고`}
              ,
            </strong>
            <span>
              {joinedHasMany
                ? `${joinedLabel} 하나도 여러 ${primaryLabel}에게 속할 수 있어요.`
                : `${joinedLabel} 하나는 ${primaryLabel} 한 명에게만 속해요.`}
            </span>
          </p>
        </div>
        <p className="auto-match-note">
          <Icons.check />
          선택한 값으로 찾은 뒤, 내부 식별자로 안전하게 연결합니다.
        </p>
      </section>
      <section>
        <h3>연결 결과</h3>
        <div className="result-summary">
          <Icons.check />
          <div>
            <strong>{internalLinks.length}개 데이터 연결을 만들었습니다</strong>
            <small>
              이름이나 번호가 바뀌어도 내부 식별자 연결은 유지됩니다.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}

function relationCardinality(
  relationType: RelationType,
  endpoint: "source" | "target",
) {
  const [source, target] = relationType.split(":");
  return endpoint === "source" ? source : target;
}

function arrangeSheetsOnGrid(sheets: Sheet[], relations: SheetRelation[]) {
  const columnCount =
    sheets.length <= 4
      ? Math.max(1, sheets.length)
      : Math.min(4, Math.ceil(Math.sqrt(sheets.length)));
  const rowCount = Math.max(1, Math.ceil(sheets.length / columnCount));
  const sheetIds = new Set(sheets.map((sheet) => sheet.id));
  const neighbors = new Map(
    sheets.map((sheet) => [sheet.id, new Set<string>()]),
  );
  relations.forEach((relation) => {
    if (
      !sheetIds.has(relation.sourceSheetId) ||
      !sheetIds.has(relation.targetSheetId) ||
      relation.sourceSheetId === relation.targetSheetId
    )
      return;
    neighbors.get(relation.sourceSheetId)?.add(relation.targetSheetId);
    neighbors.get(relation.targetSheetId)?.add(relation.sourceSheetId);
  });

  const emptyCells = Array.from({ length: rowCount * columnCount }, (_, index) => ({
    row: Math.floor(index / columnCount),
    column: index % columnCount,
  }));
  const center = {
    row: (rowCount - 1) / 2,
    column: (columnCount - 1) / 2,
  };
  const placements = new Map<string, { row: number; column: number }>();
  const unplaced = new Set(sheets.map((sheet) => sheet.id));

  while (unplaced.size > 0) {
    const nextSheetId = [...unplaced].sort((left, right) => {
      const leftPlacedNeighbors = [...(neighbors.get(left) ?? [])].filter(
        (neighbor) => placements.has(neighbor),
      ).length;
      const rightPlacedNeighbors = [...(neighbors.get(right) ?? [])].filter(
        (neighbor) => placements.has(neighbor),
      ).length;
      return (
        rightPlacedNeighbors - leftPlacedNeighbors ||
        (neighbors.get(right)?.size ?? 0) - (neighbors.get(left)?.size ?? 0) ||
        left.localeCompare(right)
      );
    })[0]!;
    const placedNeighbors = [...(neighbors.get(nextSheetId) ?? [])]
      .map((neighbor) => placements.get(neighbor))
      .filter((position): position is { row: number; column: number } =>
        Boolean(position),
      );
    const target = placedNeighbors.length
      ? {
          row:
            placedNeighbors.reduce((sum, position) => sum + position.row, 0) /
            placedNeighbors.length,
          column:
            placedNeighbors.reduce(
              (sum, position) => sum + position.column,
              0,
            ) / placedNeighbors.length,
        }
      : center;
    const selectedCell = emptyCells.sort((left, right) => {
      const neighborDistance = (cell: { row: number; column: number }) =>
        placedNeighbors.reduce(
          (sum, position) =>
            sum +
            Math.abs(position.row - cell.row) +
            Math.abs(position.column - cell.column),
          0,
        );
      const targetDistance = (cell: { row: number; column: number }) =>
        Math.abs(target.row - cell.row) + Math.abs(target.column - cell.column);
      const centerDistance = (cell: { row: number; column: number }) =>
        Math.abs(center.row - cell.row) + Math.abs(center.column - cell.column);
      return (
        neighborDistance(left) - neighborDistance(right) ||
        targetDistance(left) - targetDistance(right) ||
        centerDistance(left) - centerDistance(right) ||
        left.row - right.row ||
        left.column - right.column
      );
    })[0]!;
    placements.set(nextSheetId, selectedCell);
    emptyCells.splice(emptyCells.indexOf(selectedCell), 1);
    unplaced.delete(nextSheetId);
  }

  return { columnCount, rowCount, placements };
}

function SheetErdView({
  sheets,
  relations,
  activeSheetId,
  onSelectSheet,
}: {
  sheets: Sheet[];
  relations: SheetRelation[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
}) {
  const [focusedSheetId, setFocusedSheetId] = useState<string | null>(null);
  const effectiveFocusedSheetId = sheets.some(
    (sheet) => sheet.id === focusedSheetId,
  )
    ? focusedSheetId
    : null;
  const visibleRelations = effectiveFocusedSheetId
    ? relations.filter(
        (relation) =>
          relation.sourceSheetId === effectiveFocusedSheetId ||
          relation.targetSheetId === effectiveFocusedSheetId,
      )
    : relations;
  const visibleSheetIds = effectiveFocusedSheetId
    ? new Set([
        effectiveFocusedSheetId,
        ...visibleRelations.flatMap((relation) => [
          relation.sourceSheetId,
          relation.targetSheetId,
        ]),
      ])
    : new Set(sheets.map((sheet) => sheet.id));
  const visibleSheets = sheets.filter((sheet) => visibleSheetIds.has(sheet.id));
  const focusedSheet = effectiveFocusedSheetId
    ? sheets.find((sheet) => sheet.id === effectiveFocusedSheetId)
    : null;
  const { columnCount, rowCount, placements } = arrangeSheetsOnGrid(
    visibleSheets,
    visibleRelations,
  );
  const nodeWidth = 264;
  const columnGap = 86;
  const left = 48;
  const top = 34;
  const headerHeight = 42;
  const fieldHeight = 27;
  const rowGap = 74;
  const nodeHeights = new Map(
    visibleSheets.map((sheet) => [
      sheet.id,
      headerHeight + Math.max(1, sheet.columns.length) * fieldHeight + 12,
    ]),
  );
  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(
      0,
      ...visibleSheets
        .filter((sheet) => placements.get(sheet.id)?.row === row)
        .map((sheet) => nodeHeights.get(sheet.id) ?? 0),
    ),
  );
  const rowTop = (row: number) =>
    top +
    rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) +
    row * rowGap;
  const canvasWidth = Math.max(
    760,
    left * 2 + columnCount * nodeWidth + (columnCount - 1) * columnGap,
  );
  const canvasHeight = Math.max(
    250,
    top * 2 +
      rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rowCount - 1) * rowGap,
  );
  const positions = new Map(
    visibleSheets.map((sheet) => {
      const placement = placements.get(sheet.id) ?? { row: 0, column: 0 };
      return [
        sheet.id,
        {
          x: left + placement.column * (nodeWidth + columnGap),
          y: rowTop(placement.row),
        },
      ];
    }),
  );

  return (
    <div className="sheet-erd-wrap">
      {focusedSheet && (
        <div className="sheet-erd-focus-toolbar" role="status">
          <span>
            <b>{focusedSheet.name}</b>
            직접 연결 {visibleRelations.length}개
          </span>
          <button type="button" onClick={() => setFocusedSheetId(null)}>
            전체 보기
          </button>
        </div>
      )}
      <div
        className="sheet-erd-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
        aria-label={`ERD: 테이블 ${visibleSheets.length}개, 관계 ${visibleRelations.length}개`}
      >
        <svg
          className="sheet-erd-relations"
          width={canvasWidth}
          height={canvasHeight}
          aria-hidden="true"
        >
          {visibleRelations.map((relation) => {
            const source = visibleSheets.find(
              (sheet) => sheet.id === relation.sourceSheetId,
            );
            const target = visibleSheets.find(
              (sheet) => sheet.id === relation.targetSheetId,
            );
            const sourcePosition = positions.get(relation.sourceSheetId);
            const targetPosition = positions.get(relation.targetSheetId);
            if (!source || !target || !sourcePosition || !targetPosition)
              return null;

            const sourceColumn = Math.max(
              0,
              source.columns.indexOf(relation.sourceColumn),
            );
            const targetColumn = Math.max(
              0,
              target.columns.indexOf(relation.targetColumn),
            );
            const horizontal =
              Math.abs(targetPosition.x - sourcePosition.x) >=
              Math.abs(targetPosition.y - sourcePosition.y);
            const targetIsRight = targetPosition.x >= sourcePosition.x;
            const targetIsBelow = targetPosition.y >= sourcePosition.y;
            const sourceX = horizontal
              ? sourcePosition.x + (targetIsRight ? nodeWidth : 0)
              : sourcePosition.x + nodeWidth / 2;
            const targetX = horizontal
              ? targetPosition.x + (targetIsRight ? 0 : nodeWidth)
              : targetPosition.x + nodeWidth / 2;
            const sourceY = horizontal
              ? sourcePosition.y + headerHeight + sourceColumn * fieldHeight + 13
              : sourcePosition.y +
                (targetIsBelow ? (nodeHeights.get(source.id) ?? 0) : 0);
            const targetY = horizontal
              ? targetPosition.y + headerHeight + targetColumn * fieldHeight + 13
              : targetPosition.y +
                (targetIsBelow ? 0 : (nodeHeights.get(target.id) ?? 0));
            const curve = horizontal
              ? Math.max(54, Math.abs(targetX - sourceX) * 0.42)
              : Math.max(44, Math.abs(targetY - sourceY) * 0.42);
            const sourceControlX = horizontal
              ? sourceX + (targetIsRight ? curve : -curve)
              : sourceX;
            const targetControlX = horizontal
              ? targetX + (targetIsRight ? -curve : curve)
              : targetX;
            const sourceControlY = horizontal
              ? sourceY
              : sourceY + (targetIsBelow ? curve : -curve);
            const targetControlY = horizontal
              ? targetY
              : targetY + (targetIsBelow ? -curve : curve);
            return (
              <g key={relation.id}>
                <path
                  d={`M ${sourceX} ${sourceY} C ${sourceControlX} ${sourceControlY}, ${targetControlX} ${targetControlY}, ${targetX} ${targetY}`}
                />
                <circle cx={sourceX} cy={sourceY} r="3.5" />
                <circle cx={targetX} cy={targetY} r="3.5" />
                <text
                  x={sourceX + (horizontal ? (targetIsRight ? 12 : -12) : 10)}
                  y={sourceY + (horizontal ? -7 : targetIsBelow ? 14 : -8)}
                  textAnchor={horizontal ? (targetIsRight ? "start" : "end") : "start"}
                >
                  {relationCardinality(relation.relationType, "source")}
                </text>
                <text
                  x={targetX + (horizontal ? (targetIsRight ? -12 : 12) : 10)}
                  y={targetY + (horizontal ? -7 : targetIsBelow ? -8 : 14)}
                  textAnchor={horizontal ? (targetIsRight ? "end" : "start") : "start"}
                >
                  {relationCardinality(relation.relationType, "target")}
                </text>
              </g>
            );
          })}
        </svg>
        {visibleSheets.map((sheet) => {
          const position = positions.get(sheet.id)!;
          const relatedColumns = new Set(
            visibleRelations.flatMap((relation) => {
              if (relation.sourceSheetId === sheet.id)
                return [relation.sourceColumn];
              if (relation.targetSheetId === sheet.id)
                return [relation.targetColumn];
              return [];
            }),
          );
          return (
            <button
              key={sheet.id}
              type="button"
              className={`sheet-erd-node ${sheet.id === effectiveFocusedSheetId ? "focused" : sheet.id === activeSheetId ? "active" : ""}`}
              style={{
                left: position.x,
                top: position.y,
                width: nodeWidth,
                minHeight: nodeHeights.get(sheet.id),
              }}
              aria-label={`${sheet.name} 테이블, 필드 ${sheet.columns.length}개`}
              onClick={() => {
                onSelectSheet(sheet.id);
                setFocusedSheetId((current) =>
                  current === sheet.id ? null : sheet.id,
                );
              }}
            >
              <span className="sheet-erd-node-header">
                <span className="table-dot" />
                <strong>{sheet.name}</strong>
                <small>{sheet.rows.length}행</small>
              </span>
              <span className="sheet-erd-fields">
                {sheet.columns.map((column, index) => (
                  <span
                    key={`${sheet.id}-${column}-${index}`}
                    className={relatedColumns.has(column) ? "related" : ""}
                  >
                    <span className="sheet-erd-field-key">
                      {relatedColumns.has(column) ? "↔" : ""}
                    </span>
                    <b>{column}</b>
                    <em>{columnTypeLabel(columnType(sheet, index))}</em>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Playground({ projectId, projectName, hasPassword }: { projectId: string | null; projectName: string; hasPassword: boolean }) {
  const router = useRouter();
  const isTemporary = projectId === null;
  const [displayProjectName, setDisplayProjectName] = useState(projectName);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const cancelProjectRenameRef = useRef(false);
  const [pages, setPages] = useState(isTemporary ? blankPages : initialPages);
  const [activePageId, setActivePageId] = useState(isTemporary ? "page-1" : "lca-page");
  const [selectedId, setSelectedId] = useState(isTemporary ? "" : "table");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageNameDraft, setPageNameDraft] = useState("");
  const [canvasView, setCanvasView] = useState<CanvasView>({
    x: 100,
    y: 55,
    zoom: 0.9,
  });
  const [sheets, setSheets] = useState<Sheet[]>(isTemporary ? [] : initialSheets);
  const [cellValidationErrors, setCellValidationErrors] = useState<
    Record<string, string>
  >({});
  const [activeSheetId, setActiveSheetId] = useState(isTemporary ? "" : "stg-source");
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [sheetNameDraft, setSheetNameDraft] = useState("");
  const cancelSheetRenameRef = useRef(false);
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(
    null,
  );
  const [columnNameDraft, setColumnNameDraft] = useState("");
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [newColumnDraft, setNewColumnDraft] = useState<NewColumnDraft | null>(
    null,
  );
  const [sheetRelations, setSheetRelations] = useState<SheetRelation[]>(
    isTemporary ? [] : initialSheetRelations,
  );
  const [relationDraft, setRelationDraft] = useState<RelationDraft | null>(
    null,
  );
  const [calculatedFields, setCalculatedFields] = useState<CalculatedField[]>(
    [],
  );
  const [calculationDraft, setCalculationDraft] =
    useState<CalculationDraft | null>(null);
  const [conditionalSumDraft, setConditionalSumDraft] =
    useState<ConditionalSumDraft | null>(null);
  const [editingCalculatedFieldId, setEditingCalculatedFieldId] = useState<
    string | null
  >(null);
  const [inspectingCalculatedField, setInspectingCalculatedField] =
    useState<CalculatedField | null>(null);
  const [developerSpecOpen, setDeveloperSpecOpen] = useState(false);
  const [propertyTab, setPropertyTab] = useState<"design" | "data" | "action">(
    "design",
  );
  const [dataBinding, setDataBinding] = useState<DataBindingConfig>(
    isTemporary ? blankDataBinding : initialDataBinding,
  );
  const [displayBindings, setDisplayBindings] = useState<DisplayBindings>(isTemporary ? {} : {
    heading: {
      sheetId: "dim-master",
      field: "자재명",
      fields: [],
      rowId: "dim-row-1",
    },
    table: {
      sheetId: "fact-flow",
      field: "",
      fields: ["기간", "사업장 ID", "자재 번호", "실적 유형", "수량", "단위"],
      rowId: "",
    },
  });
  const [hydrated, setHydrated] = useState(isTemporary);
  const skipInitialSaveRef = useRef(true);
  const [saveStatus, setSaveStatus] = useState(isTemporary ? "저장되지 않는 임시 캔버스" : "데이터베이스 연결 중");
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState<
    SavedProjectSnapshot[]
  >([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");
  const [restoringSnapshotId, setRestoringSnapshotId] = useState("");
  const [securityDialog, setSecurityDialog] = useState<"set-pin" | "delete" | null>(null);
  const [securityPin, setSecurityPin] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityLoading, setSecurityLoading] = useState(false);
  const projectHistoryRef = useRef<ProjectSnapshot[]>([]);
  const projectHistoryIndexRef = useRef(-1);
  const applyingProjectHistoryRef = useRef(false);
  const latestProjectSnapshotRef = useRef<ProjectSnapshot | null>(null);
  const projectHistoryCommitTimeoutRef = useRef<number | null>(null);
  const projectHistoryInteractionRef = useRef(false);
  const [projectHistoryControls, setProjectHistoryControls] = useState({
    canUndo: false,
    canRedo: false,
  });
  const undoProjectRef = useRef<() => void>(() => undefined);
  const redoProjectRef = useRef<() => void>(() => undefined);
  const [sheetDockHeight, setSheetDockHeight] = useState(235);
  const [sheetDockMode, setSheetDockMode] =
    useState<SheetDockMode>("normal");
  const [sheetViewMode, setSheetViewMode] = useState<SheetViewMode>("grid");
  const [sheetSearchOpen, setSheetSearchOpen] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState("");
  const normalSheetDockHeightRef = useRef(235);
  const nextId = useRef(1);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pannedCanvasRef = useRef(false);
  const movedItemRef = useRef(false);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const items = activePage.items;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const activeSheet =
    sheets.find((sheet) => sheet.id === activeSheetId) ??
    sheets[0] ??
    emptySheet;
  const sheetSearchResults = sheets.filter((sheet) =>
    sheet.name
      .toLocaleLowerCase("ko-KR")
      .includes(sheetSearchQuery.trim().toLocaleLowerCase("ko-KR")),
  );
  const activeCalculatedFields = calculatedFields.filter(
    (field) => field.resultSheetId === activeSheet.id,
  );
  const numericFieldNames = (sheet: Sheet) => [
    ...numericColumns(sheet),
    ...calculatedFields
      .filter((field) => field.resultSheetId === sheet.id)
      .map((field) => field.name),
  ];
  const allActiveRelations = sheetRelations.filter(
    (relation) =>
      relation.sourceSheetId === activeSheet.id ||
      relation.targetSheetId === activeSheet.id,
  );
  const reachableSheetPaths = reachableSheetsFrom(
    activeSheet,
    sheetRelations,
    sheets,
  );
  const calculableSheetPaths = reachableSheetPaths.filter(
    ({ sheet }) => numericFieldNames(sheet).length > 0,
  );
  const calculableRelations = sheetRelations.filter((relation) =>
    reachableSheetPaths.some(({ relationPath }) =>
      relationPath.includes(relation.id),
    ),
  );
  const canCreateCalculation = calculableSheetPaths.length > 0;
  const conditionalSheetPaths = aggregateReachableSheetsFrom(
    activeSheet,
    sheetRelations,
    sheets,
  );
  const aggregateSheetPaths = conditionalSheetPaths.filter(
    ({ sheet, relationPath }) =>
      relationPath.length > 0 && numericColumns(sheet).length > 0,
  );
  const canCreateConditionalSum = aggregateSheetPaths.length > 0;
  const canvasContentHeight = items.reduce((bottom, item, index) => {
    const position = itemPosition(item, index);
    return Math.max(
      bottom,
      position.y + (item.height ?? defaultItemHeight(item.kind)) + 40,
    );
  }, 460);

  const updateProjectHistoryControls = useCallback(() => {
    setProjectHistoryControls({
      canUndo: projectHistoryIndexRef.current > 0,
      canRedo:
        projectHistoryIndexRef.current >= 0 &&
        projectHistoryIndexRef.current < projectHistoryRef.current.length - 1,
    });
  }, []);

  const clearProjectHistoryCommitTimeout = useCallback(() => {
    if (projectHistoryCommitTimeoutRef.current === null) return;
    window.clearTimeout(projectHistoryCommitTimeoutRef.current);
    projectHistoryCommitTimeoutRef.current = null;
  }, []);

  const commitLatestProjectSnapshot = useCallback(() => {
    clearProjectHistoryCommitTimeout();
    const snapshot = latestProjectSnapshotRef.current;
    if (!snapshot) return;
    const currentSnapshot =
      projectHistoryRef.current[projectHistoryIndexRef.current];
    if (
      currentSnapshot &&
      JSON.stringify(currentSnapshot) === JSON.stringify(snapshot)
    )
      return;
    const nextHistory = [
      ...projectHistoryRef.current.slice(
        0,
        projectHistoryIndexRef.current + 1,
      ),
      structuredClone(snapshot),
    ].slice(-projectHistoryLimit);
    projectHistoryRef.current = nextHistory;
    projectHistoryIndexRef.current = nextHistory.length - 1;
    updateProjectHistoryControls();
  }, [clearProjectHistoryCommitTimeout, updateProjectHistoryControls]);

  const queueProjectHistoryCommit = useCallback(
    (delay = projectHistoryInputDelay) => {
      clearProjectHistoryCommitTimeout();
      projectHistoryCommitTimeoutRef.current = window.setTimeout(() => {
        projectHistoryCommitTimeoutRef.current = null;
        commitLatestProjectSnapshot();
      }, delay);
    },
    [clearProjectHistoryCommitTimeout, commitLatestProjectSnapshot],
  );

  function beginProjectHistoryInteraction() {
    commitLatestProjectSnapshot();
    projectHistoryInteractionRef.current = true;
  }

  function endProjectHistoryInteraction() {
    projectHistoryInteractionRef.current = false;
    queueProjectHistoryCommit(0);
  }

  function applyProjectSnapshot(snapshot: ProjectSnapshot) {
    clearProjectHistoryCommitTimeout();
    applyingProjectHistoryRef.current = true;
    latestProjectSnapshotRef.current = structuredClone(snapshot);
    setPages(snapshot.pages);
    setActivePageId(snapshot.activePageId);
    setCanvasView(snapshot.canvasView);
    setSheets(snapshot.sheets);
    setDataBinding(snapshot.dataBinding);
    setDisplayBindings(snapshot.displayBindings);
    setSheetRelations(snapshot.sheetRelations);
    setCalculatedFields(snapshot.calculatedFields);
  }

  function moveProjectHistory(offset: -1 | 1) {
    commitLatestProjectSnapshot();
    const nextIndex = projectHistoryIndexRef.current + offset;
    const snapshot = projectHistoryRef.current[nextIndex];
    if (!snapshot) return;
    projectHistoryIndexRef.current = nextIndex;
    applyProjectSnapshot(structuredClone(snapshot));
    updateProjectHistoryControls();
  }

  function undoProject() {
    moveProjectHistory(-1);
  }

  function redoProject() {
    moveProjectHistory(1);
  }

  function currentProjectDocument() {
    return {
      schemaVersion: 9,
      pages,
      activePageId,
      canvasView,
      sheets,
      dataBinding,
      displayBindings,
      sheetRelations,
      calculatedFields,
    };
  }

  function startProjectRename() {
    cancelProjectRenameRef.current = false;
    setProjectNameDraft(displayProjectName);
    setEditingProjectName(true);
  }

  function cancelProjectRename() {
    cancelProjectRenameRef.current = true;
    setProjectNameDraft(displayProjectName);
    setEditingProjectName(false);
  }

  async function saveProjectName() {
    if (cancelProjectRenameRef.current) {
      cancelProjectRenameRef.current = false;
      return;
    }

    const name = projectNameDraft.trim();
    setEditingProjectName(false);
    if (!name || name === displayProjectName) return;

    const previousName = displayProjectName;
    setDisplayProjectName(name);
    if (isTemporary) {
      setSaveStatus("이름 변경은 현재 탭에서만 유지됩니다");
      return;
    }
    setSaveStatus("프로젝트 이름 저장 중");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, document: currentProjectDocument() }),
      });
      if (!response.ok) throw new Error("프로젝트 이름을 저장하지 못했습니다.");
      setSaveStatus("프로젝트 이름 저장됨");
    } catch {
      setDisplayProjectName(previousName);
      setProjectNameDraft(previousName);
      setSaveStatus("프로젝트 이름 저장 실패 · 다시 시도하세요");
    }
  }

  async function loadSavedSnapshots() {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/snapshots`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("스냅샷 기록을 불러오지 못했습니다.");
    const payload = (await response.json()) as {
      snapshots?: SavedProjectSnapshot[];
    };
    setSavedSnapshots(payload.snapshots ?? []);
  }

  async function saveProjectSnapshot() {
    if (!projectId) {
      if (window.confirm("현재 작업을 저장하려면 프로젝트를 만들어야 합니다. 프로젝트 생성 화면으로 이동할까요?"))
        router.push("/projects/new");
      return;
    }
    commitLatestProjectSnapshot();
    setSnapshotPanelOpen(true);
    setSnapshotLoading(true);
    setSnapshotError("");
    setSaveStatus("프로젝트와 스냅샷 저장 중");
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: currentProjectDocument() }),
      });
      if (!response.ok) throw new Error("스냅샷을 저장하지 못했습니다.");
      await loadSavedSnapshots();
      setSaveStatus("프로젝트와 스냅샷 저장됨");
    } catch (error) {
      setSnapshotError(
        error instanceof Error ? error.message : "스냅샷 저장에 실패했습니다.",
      );
      setSaveStatus("스냅샷 저장 실패 · 다시 시도하세요");
    } finally {
      setSnapshotLoading(false);
    }
  }

  function openSecurityDialog(dialog: "set-pin" | "delete") {
    setSecurityPin("");
    setSecurityError("");
    setSecurityDialog(dialog);
  }

  async function submitSecurityDialog() {
    if (!projectId || !securityDialog) return;
    const needsPin = securityDialog === "set-pin" || hasPassword;
    if (needsPin && securityPin.length !== 4) return setSecurityError("숫자 4자리를 입력해주세요.");
    setSecurityLoading(true);
    setSecurityError("");
    const settingPin = securityDialog === "set-pin";
    const response = await fetch(`/api/projects/${projectId}${settingPin ? "/password" : ""}`, { method: settingPin ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: securityPin || undefined }) });
    if (!response.ok) {
      setSecurityError(settingPin ? "비밀번호를 설정하지 못했습니다." : hasPassword ? "비밀번호가 올바르지 않습니다." : "프로젝트를 삭제하지 못했습니다.");
      setSecurityLoading(false);
      return;
    }
    setSecurityDialog(null);
    setSecurityLoading(false);
    if (settingPin) {
      setSaveStatus("비밀번호 설정됨");
      router.refresh();
    } else {
      router.push("/projects");
      router.refresh();
    }
  }

  async function restoreSavedSnapshot(snapshot: SavedProjectSnapshot) {
    if (
      !window.confirm(
        `${savedSnapshotTime(snapshot.createdAt)} 스냅샷으로 되돌릴까요? 현재 상태도 복원 전 스냅샷으로 보관됩니다.`,
      )
    )
      return;
    setRestoringSnapshotId(snapshot.id);
    setSnapshotError("");
    setSaveStatus("스냅샷 복원 중");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/snapshots/${snapshot.id}`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("스냅샷을 복원하지 못했습니다.");
      const payload = (await response.json()) as {
        project?: { document?: unknown };
      };
      if (!isProjectSnapshot(payload.project?.document))
        throw new Error("복원할 프로젝트 문서가 올바르지 않습니다.");
      applyProjectSnapshot(structuredClone(payload.project.document));
      commitLatestProjectSnapshot();
      await loadSavedSnapshots();
      setSaveStatus("스냅샷에서 복원됨");
    } catch (error) {
      setSnapshotError(
        error instanceof Error ? error.message : "스냅샷 복원에 실패했습니다.",
      );
      setSaveStatus("스냅샷 복원 실패 · 다시 시도하세요");
    } finally {
      setRestoringSnapshotId("");
    }
  }

  useEffect(() => {
    undoProjectRef.current = undoProject;
    redoProjectRef.current = redoProject;
  });

  function setItems(
    updater: CanvasItem[] | ((current: CanvasItem[]) => CanvasItem[]),
  ) {
    setPages((current) =>
      current.map((page) =>
        page.id !== activePage.id
          ? page
          : {
              ...page,
              items:
                typeof updater === "function" ? updater(page.items) : updater,
            },
      ),
    );
  }

  function itemPosition(item: CanvasItem, index: number) {
    const fallback = defaultItemPosition(index);
    return { x: item.x ?? fallback.x, y: item.y ?? fallback.y };
  }

  function renderedItemSize(itemId: string, fallbackKind: ComponentKind) {
    const element = [
      ...document.querySelectorAll<HTMLElement>(".canvas-ui-item"),
    ].find((candidate) => candidate.dataset.itemId === itemId);
    if (!element) return { width: defaultItemWidth(fallbackKind), height: 60 };
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width / canvasView.zoom,
      height: rect.height / canvasView.zoom,
    };
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}?loadedAt=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("프로젝트를 불러오지 못했습니다.");
        return response.json() as Promise<{
          project?: {
            name?: string;
            document?: {
              schemaVersion?: number;
              items?: CanvasItem[];
              pages?: BuilderPage[];
              activePageId?: string;
              canvasView?: CanvasView;
              sheets?: Sheet[];
              dataBinding?: DataBindingConfig;
              displayBindings?: DisplayBindings;
              sheetRelations?: SheetRelation[];
              calculatedFields?: CalculatedField[];
            };
          };
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload.project?.name)
          setDisplayProjectName(payload.project.name);
        const document = payload.project?.document;
        const hasCurrentDataModel = (document?.schemaVersion ?? 0) >= 7;
        if (Array.isArray(document?.pages) && document.pages.length > 0)
          setPages(document.pages);
        else if (Array.isArray(document?.items) && document.items.length > 0)
          setPages([{ ...initialPages[0], items: document.items }]);
        if (document?.activePageId) setActivePageId(document.activePageId);
        if (document?.canvasView) setCanvasView(document.canvasView);
        if (
          hasCurrentDataModel &&
          Array.isArray(document?.sheets)
        )
          setSheets(document.sheets);
        if (hasCurrentDataModel && document?.dataBinding)
          setDataBinding(document.dataBinding);
        if (hasCurrentDataModel && document?.displayBindings)
          setDisplayBindings(document.displayBindings);
        if (hasCurrentDataModel && Array.isArray(document?.sheetRelations))
          setSheetRelations(
            document.sheetRelations.map((relation) => ({
              ...relation,
              updateOption: "none",
            })),
          );
        if (hasCurrentDataModel && Array.isArray(document?.calculatedFields))
          setCalculatedFields(
            document.calculatedFields.filter(
              (field) =>
                isConditionalSumField(field)
                  ? Array.isArray(field.relationPath) &&
                    Array.isArray(field.conditions)
                  : Array.isArray(field.formula) &&
                    Array.isArray(field.relationIds),
            ),
          );
        setSaveStatus("PostgreSQL에서 불러옴");
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("DB 연결 실패");
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot: ProjectSnapshot = {
      pages,
      activePageId,
      canvasView,
      sheets,
      dataBinding,
      displayBindings,
      sheetRelations,
      calculatedFields,
    };
    latestProjectSnapshotRef.current = structuredClone(snapshot);
    if (applyingProjectHistoryRef.current) {
      applyingProjectHistoryRef.current = false;
      return;
    }
    if (projectHistoryRef.current.length === 0) {
      commitLatestProjectSnapshot();
      return;
    }
    if (projectHistoryInteractionRef.current) return;
    queueProjectHistoryCommit();
  }, [
    activePageId,
    calculatedFields,
    canvasView,
    dataBinding,
    displayBindings,
    hydrated,
    pages,
    sheetRelations,
    sheets,
    commitLatestProjectSnapshot,
    queueProjectHistoryCommit,
  ]);

  useEffect(
    () => () => {
      clearProjectHistoryCommitTimeout();
    },
    [clearProjectHistoryCommitTimeout],
  );

  useEffect(() => {
    if (!hydrated) return;
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const undo = key === "z" && !event.shiftKey;
      const redo =
        (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      if (!undo && !redo) return;
      event.preventDefault();
      if (undo) undoProjectRef.current();
      else redoProjectRef.current();
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !projectId) return;
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      setSaveStatus("PostgreSQL에 저장 중");
      fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: {
            schemaVersion: 9,
            pages,
            activePageId,
            canvasView,
            sheets,
            dataBinding,
            displayBindings,
            sheetRelations,
            calculatedFields,
          },
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("저장 실패");
          setSaveStatus("PostgreSQL에 저장됨");
        })
        .catch(() => setSaveStatus("저장 실패 · 다시 시도하세요"));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [
    activePageId,
    calculatedFields,
    canvasView,
    dataBinding,
    displayBindings,
    hydrated,
    pages,
    projectId,
    sheetRelations,
    sheets,
  ]);

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (event.key !== "Backspace" || !selectedId) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      event.preventDefault();
      setPages((current) =>
        current.map((page) =>
          page.id === activePageId
            ? {
                ...page,
                items: page.items.filter((item) => item.id !== selectedId),
              }
            : page,
        ),
      );
      setDisplayBindings((current) => {
        const next = { ...current };
        delete next[selectedId];
        return next;
      });
      setSelectedId("");
      setPropertiesOpen(false);
    }
    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [activePageId, selectedId]);

  useEffect(() => {
    if (editingColumnIndex === null) return;
    function closeColumnEditor(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".column-editor, [aria-label$='필드 편집']")) return;
      setEditingColumnIndex(null);
    }
    document.addEventListener("pointerdown", closeColumnEditor);
    return () => document.removeEventListener("pointerdown", closeColumnEditor);
  }, [editingColumnIndex]);

  useEffect(() => {
    if (!fieldMenuOpen) return;
    function closeFieldMenu(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".field-add-menu, [aria-label='필드 추가']")) return;
      setFieldMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeFieldMenu);
    return () => document.removeEventListener("pointerdown", closeFieldMenu);
  }, [fieldMenuOpen]);

  useEffect(() => {
    if (!sheetSearchOpen) return;
    function closeSheetSearch(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          ".sheet-search-popover, [aria-label='데이터 시트 검색']",
        )
      )
        return;
      setSheetSearchOpen(false);
    }
    document.addEventListener("pointerdown", closeSheetSearch);
    return () => document.removeEventListener("pointerdown", closeSheetSearch);
  }, [sheetSearchOpen]);

  function addItem(kind: ComponentKind) {
    const source = groups
      .flatMap((group) => group.items)
      .find((item) => item.kind === kind);
    if (!source) return;
    const nextY = items.reduce((bottom, item, index) => {
      const position = itemPosition(item, index);
      return Math.max(
        bottom,
        position.y + renderedItemSize(item.id, item.kind).height + 20,
      );
    }, 0);
    const next = {
      id: `${kind}-${nextId.current++}`,
      kind,
      label: source.name,
      x: 0,
      y: nextY,
      width: defaultItemWidth(kind),
      ...(kind === "text"
        ? { subtitle: "설명 내용을 입력하세요.", showSubtitle: true }
        : {}),
    };
    setItems((current) => [...current, next]);
    if (kind === "text" || kind === "table") {
      const firstSheet = sheets[0];
      if (firstSheet)
        setDisplayBindings((current) => ({
          ...current,
          [next.id]: {
            sheetId: firstSheet.id,
            field: firstSheet.columns[0] ?? "",
            fields: firstSheet.columns.slice(0, 5),
            rowId: firstSheet.rowIds[0] ?? "",
          },
        }));
    }
    setSelectedId(next.id);
    setPropertiesOpen(true);
  }

  function updateLabel(label: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === selectedId ? { ...item, label } : item,
      ),
    );
  }

  function updateSubtitle(subtitle: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === selectedId ? { ...item, subtitle } : item,
      ),
    );
  }

  function updateSubtitleVisibility(showSubtitle: boolean) {
    setItems((current) =>
      current.map((item) =>
        item.id === selectedId ? { ...item, showSubtitle } : item,
      ),
    );
  }

  function updateFontSize(fontSize: number) {
    const normalized = Math.min(72, Math.max(10, fontSize || 10));
    setItems((current) =>
      current.map((item) =>
        item.id === selectedId ? { ...item, fontSize: normalized } : item,
      ),
    );
  }

  function addSheet() {
    const sequence = sheets.length + 1;
    const sheetId = `table-${crypto.randomUUID()}`;
    const sheet: Sheet = {
      id: sheetId,
      name: `새 시트 ${sequence}`,
      columns: ["이름", "생성일"],
      columnTypes: ["text", "date"],
      rowIds: [`${sheetId}-internal-row-${crypto.randomUUID()}`],
      rows: [["", ""]],
    };
    setSheets((current) => [...current, sheet]);
    setActiveSheetId(sheet.id);
  }

  function startSheetRename(sheet: Sheet = activeSheet) {
    cancelSheetRenameRef.current = false;
    setActiveSheetId(sheet.id);
    setSheetNameDraft(sheet.name);
    setEditingSheetId(sheet.id);
  }

  function saveSheetName() {
    if (!editingSheetId) return;
    const name = sheetNameDraft.trim();
    if (name)
      setSheets((current) =>
        current.map((sheet) =>
          sheet.id === editingSheetId ? { ...sheet, name } : sheet,
        ),
      );
    setEditingSheetId(null);
  }

  function cancelSheetRename() {
    cancelSheetRenameRef.current = true;
    setEditingSheetId(null);
  }

  function deleteSheet(sheetToDelete: Sheet = activeSheet) {
    if (
      !window.confirm(
        `'${sheetToDelete.name}' 시트를 삭제할까요? 연결된 컴포넌트의 데이터 설정도 해제됩니다.`,
      )
    )
      return;
    const remaining = sheets.filter((sheet) => sheet.id !== sheetToDelete.id);
    const nextSheet =
      activeSheet.id === sheetToDelete.id
        ? remaining[0]
        : sheets.find((sheet) => sheet.id === activeSheet.id);
    setSheets(remaining);
    setActiveSheetId(nextSheet?.id ?? "");
    setEditingSheetId(null);
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, binding]) => binding.sheetId !== sheetToDelete.id,
        ),
      ),
    );
    setSheetRelations((current) =>
      current.filter(
        (relation) =>
          relation.sourceSheetId !== sheetToDelete.id &&
          relation.targetSheetId !== sheetToDelete.id,
      ),
    );
    setCalculatedFields((current) =>
      current.filter(
        (field) =>
          field.resultSheetId !== sheetToDelete.id &&
          (isConditionalSumField(field)
            ? field.sourceSheetId !== sheetToDelete.id &&
              !field.conditions.some(
                (condition) => condition.sheetId === sheetToDelete.id,
              )
            : !field.formula.some(
                (token) =>
                  token.kind === "field" &&
                  token.sheetId === sheetToDelete.id,
              )),
      ),
    );
    setDataBinding((current) => {
      const referenced =
        current.connectionPath.includes(sheetToDelete.id) ||
        current.primarySheet === sheetToDelete.id ||
        current.joinedSheet === sheetToDelete.id;
      if (!referenced) return current;
      if (!nextSheet)
        return {
          primarySheet: "",
          joinedSheet: "",
          linkSourceId: "",
          connectionPath: [],
          selectedCandidateId: "",
          relationType: "1:1",
        };
      return {
        primarySheet: nextSheet.id,
        joinedSheet:
          remaining.find((sheet) => sheet.id !== nextSheet.id)?.id ??
          nextSheet.id,
        linkSourceId: nextSheet.id,
        connectionPath: [nextSheet.id],
        selectedCandidateId: "",
        relationType: "1:1",
      };
    });
  }

  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const rowId = activeSheet.rowIds[rowIndex] ?? String(rowIndex);
    const errorKey = `${activeSheet.id}:${rowId}:${columnIndex}`;
    const result = validateSheetValue(
      columnType(activeSheet, columnIndex),
      value,
    );
    if (!result.valid) {
      setCellValidationErrors((current) => ({
        ...current,
        [errorKey]: result.message,
      }));
      return;
    }
    setCellValidationErrors((current) => {
      if (!(errorKey in current)) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              rows: sheet.rows.map((row, index) =>
                index !== rowIndex
                  ? row
                  : row.map((cell, cellIndex) =>
                      cellIndex === columnIndex ? result.value : cell,
                    ),
              ),
            },
      ),
    );
  }

  function clearCellValidationError(errorKey: string) {
    setCellValidationErrors((current) => {
      if (!(errorKey in current)) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  }

  function addRow() {
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              rowIds: [
                ...sheet.rowIds,
                `${sheet.id}-internal-row-${crypto.randomUUID()}`,
              ],
              rows: [...sheet.rows, sheet.columns.map(() => "")],
            },
      ),
    );
  }

  function deleteRow(rowIndex: number) {
    if (!window.confirm(`${rowIndex + 1}번째 행을 삭제할까요?`)) return;
    const rowId = activeSheet.rowIds[rowIndex];
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              rowIds: sheet.rowIds.filter((_, index) => index !== rowIndex),
              rows: sheet.rows.filter((_, index) => index !== rowIndex),
            },
      ),
    );
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, binding]) => [
          itemId,
          binding.sheetId === activeSheet.id && binding.rowId === rowId
            ? {
                ...binding,
                rowId:
                  activeSheet.rowIds.find((_, index) => index !== rowIndex) ??
                  "",
              }
            : binding,
        ]),
      ),
    );
    setSheetRelations((current) =>
      current.map((relation) => ({
        ...relation,
        links: relation.links.filter(
          (link) => link.sourceRowId !== rowId && link.targetRowId !== rowId,
        ),
      })),
    );
  }

  function startColumnCreation() {
    let sequence = activeSheet.columns.length + 1;
    let name = `새 필드 ${sequence}`;
    while (activeSheet.columns.includes(name)) name = `새 필드 ${++sequence}`;
    setNewColumnDraft({ name, type: "text" });
  }

  function addColumn() {
    if (!newColumnDraft) return;
    const name = newColumnDraft.name.trim();
    if (!name || activeSheet.columns.includes(name)) return;
    const defaultValue = newColumnDraft.type === "boolean" ? "아니오" : "";
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              columns: [...sheet.columns, name],
              columnTypes: [
                ...sheet.columns.map(
                  (_, index) => sheet.columnTypes?.[index] ?? null,
                ),
                newColumnDraft.type,
              ],
              rows: sheet.rows.map((row) => [...row, defaultValue]),
            },
      ),
    );
    setNewColumnDraft(null);
  }

  function startColumnEdit(columnIndex: number) {
    setEditingColumnIndex(columnIndex);
    setColumnNameDraft(activeSheet.columns[columnIndex]);
  }

  function saveColumnName() {
    if (editingColumnIndex === null) return;
    const name = columnNameDraft.trim();
    const previous = activeSheet.columns[editingColumnIndex];
    if (!name || (name !== previous && activeSheet.columns.includes(name)))
      return;
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              columns: sheet.columns.map((column, index) =>
                index === editingColumnIndex ? name : column,
              ),
            },
      ),
    );
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, binding]) => [
          itemId,
          binding.sheetId !== activeSheet.id
            ? binding
            : {
                ...binding,
                field: binding.field === previous ? name : binding.field,
                fields: binding.fields.map((field) =>
                  field === previous ? name : field,
                ),
              },
        ]),
      ),
    );
    setSheetRelations((current) =>
      current.map((relation) => ({
        ...relation,
        sourceColumn:
          relation.sourceSheetId === activeSheet.id &&
          relation.sourceColumn === previous
            ? name
            : relation.sourceColumn,
        targetColumn:
          relation.targetSheetId === activeSheet.id &&
          relation.targetColumn === previous
            ? name
            : relation.targetColumn,
      })),
    );
    setEditingColumnIndex(null);
  }

  function deleteColumn(columnIndex: number) {
    if (activeSheet.columns.length <= 1) return;
    const column = activeSheet.columns[columnIndex];
    if (
      !window.confirm(
        `'${column}' 필드를 삭제할까요? 이 필드의 데이터도 함께 삭제됩니다.`,
      )
    )
      return;
    const nextColumns = activeSheet.columns.filter(
      (_, index) => index !== columnIndex,
    );
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id !== activeSheet.id
          ? sheet
          : {
              ...sheet,
              columns: nextColumns,
              columnTypes: sheet.columnTypes?.filter(
                (_, index) => index !== columnIndex,
              ),
              rows: sheet.rows.map((row) =>
                row.filter((_, index) => index !== columnIndex),
              ),
            },
      ),
    );
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, binding]) => [
          itemId,
          binding.sheetId !== activeSheet.id
            ? binding
            : {
                ...binding,
                field:
                  binding.field === column
                    ? (nextColumns[0] ?? "")
                    : binding.field,
                fields: binding.fields.filter((field) => field !== column),
              },
        ]),
      ),
    );
    setDataBinding((current) => ({ ...current, selectedCandidateId: "" }));
    setSheetRelations((current) =>
      current.filter(
        (relation) =>
          !(
            relation.sourceSheetId === activeSheet.id &&
            relation.sourceColumn === column
          ) &&
          !(
            relation.targetSheetId === activeSheet.id &&
            relation.targetColumn === column
          ),
      ),
    );
    setCalculatedFields((current) =>
      current.filter(
        (field) => {
          if (isConditionalSumField(field))
            return !(
              (field.sourceSheetId === activeSheet.id &&
                field.valueColumn === column) ||
              field.conditions.some(
                (condition) =>
                  (condition.sheetId ?? field.sourceSheetId) ===
                    activeSheet.id && condition.column === column,
              ) ||
              (field.resultSheetId === activeSheet.id &&
                field.conditions.some(
                  (condition) =>
                    condition.operand.kind === "currentRowField" &&
                    condition.operand.column === column,
                ))
            );
          return !field.formula.some(
            (token) =>
              token.kind === "field" &&
              token.sheetId === activeSheet.id &&
              token.column === column,
          );
        },
      ),
    );
    setEditingColumnIndex(null);
  }

  function startRelationForSheet(sourceSheetId: string) {
    const source = sheets.find((sheet) => sheet.id === sourceSheetId);
    const target = sheets.find((sheet) => sheet.id !== sourceSheetId);
    if (!source || !target) return;
    const candidates = detectJoinCandidates(source, target);
    setRelationDraft({
      sourceSheetId,
      sourceColumn: source.columns[candidates[0]?.leftColumn ?? 0] ?? "",
      targetSheetId: target.id,
      targetColumn: target.columns[candidates[0]?.rightColumn ?? 0] ?? "",
      relationType: "",
    });
  }

  function saveSheetRelation() {
    if (!relationDraft?.relationType || !relationDraft.targetColumn) return;
    const relationWithoutLinks = {
      id: crypto.randomUUID(),
      ...relationDraft,
      relationType: relationDraft.relationType,
      updateOption: "none" as const,
    };
    const relation: SheetRelation = {
      ...relationWithoutLinks,
      links: buildRelationLinks(relationWithoutLinks, sheets),
    };
    setSheetRelations((current) => [
      ...current.filter(
        (item) =>
          !(
            item.sourceSheetId === relation.sourceSheetId &&
            item.sourceColumn === relation.sourceColumn
          ),
      ),
      relation,
    ]);
    setRelationDraft(null);
  }

  function startCalculation() {
    if (!canCreateCalculation) return;
    const availableFields = calculableSheetPaths.flatMap(
      ({ sheet, relationPath }) =>
        numericFieldNames(sheet).map((column) => ({
          sheet,
          column,
          relationPath,
        })),
    );
    const firstField = availableFields[0];
    const secondField = availableFields[1] ?? firstField;
    if (!firstField || !secondField) return;
    setCalculationDraft({
      relationIds: calculableRelations.map((item) => item.id),
      formula: [
        {
          kind: "field",
          sheetId: firstField.sheet.id,
          column: firstField.column,
          relationPath: firstField.relationPath,
        },
        { kind: "operator", operator: "*" },
        {
          kind: "field",
          sheetId: secondField.sheet.id,
          column: secondField.column,
          relationPath: secondField.relationPath,
        },
      ],
      name: `${firstField.sheet.name}·${secondField.sheet.name} 계산`,
    });
    setEditingCalculatedFieldId(null);
  }

  function editCalculatedField(field: CalculatedField) {
    setInspectingCalculatedField(null);
    setEditingCalculatedFieldId(field.id);
    if (isConditionalSumField(field)) {
      setConditionalSumDraft({
        name: field.name,
        resultSheetId: field.resultSheetId,
        sourceSheetId: field.sourceSheetId,
        relationPath: field.relationPath,
        valueColumn: field.valueColumn,
        conditions: field.conditions,
      });
      return;
    }
    setCalculationDraft({
      name: field.name,
      relationIds: field.relationIds,
      formula: field.formula,
    });
  }

  function closeCalculatedFieldEditor() {
    setConditionalSumDraft(null);
    setCalculationDraft(null);
    setEditingCalculatedFieldId(null);
  }

  function replaceCalculatedField(
    current: CalculatedField[],
    nextField: CalculatedField,
  ) {
    const previous = current.find((field) => field.id === nextField.id);
    return current.map((field) => {
      if (field.id === nextField.id) return nextField;
      if (!previous || previous.name === nextField.name || isConditionalSumField(field))
        return field;
      return {
        ...field,
        formula: field.formula.map((token) =>
          token.kind === "field" &&
          token.sheetId === previous.resultSheetId &&
          token.column === previous.name
            ? { ...token, column: nextField.name }
            : token,
        ),
      };
    });
  }

  function updateBindingsForCalculatedFieldRename(nextName: string) {
    const previous = calculatedFields.find(
      (field) => field.id === editingCalculatedFieldId,
    );
    if (!previous || previous.name === nextName) return;
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, binding]) => [
          itemId,
          binding.sheetId === previous.resultSheetId
            ? {
                ...binding,
                field: binding.field === previous.name ? nextName : binding.field,
                fields: binding.fields.map((name) =>
                  name === previous.name ? nextName : name,
                ),
              }
            : binding,
        ]),
      ),
    );
  }

  function selectConditionalSumSource(sheetId: string) {
    const target = aggregateSheetPaths.find(({ sheet }) => sheet.id === sheetId);
    if (!target) return;
    const valueColumn = numericColumns(target.sheet)[0] ?? "";
    setConditionalSumDraft((current) =>
      current && {
        ...current,
        sourceSheetId: target.sheet.id,
        relationPath: target.relationPath,
        valueColumn,
        conditions: [
          {
            id: crypto.randomUUID(),
            sheetId: target.sheet.id,
            relationPath: target.relationPath,
            column: target.sheet.columns[0] ?? "",
            operator: "eq",
            operand: { kind: "literal", value: "" },
          },
        ],
      },
    );
  }

  function addConditionalSumCondition() {
    const target = aggregateSheetPaths.find(
      ({ sheet }) => sheet.id === conditionalSumDraft?.sourceSheetId,
    );
    if (!target) return;
    setConditionalSumDraft((current) =>
      current && {
        ...current,
        conditions: [
          ...current.conditions,
          {
            id: crypto.randomUUID(),
            sheetId: target.sheet.id,
            relationPath: target.relationPath,
            column: target.sheet.columns[0] ?? "",
            operator: "eq",
            operand: { kind: "literal", value: "" },
          },
        ],
      },
    );
  }

  function saveConditionalSum() {
    if (!conditionalSumDraft?.name.trim()) return;
    const name = conditionalSumDraft.name.trim();
    if (
      activeSheet.columns.includes(name) ||
      activeCalculatedFields.some(
        (field) => field.name === name && field.id !== editingCalculatedFieldId,
      )
    )
      return;
    setCalculatedFields((current) => {
      const nextField: ConditionalSumField = {
        ...conditionalSumDraft,
        id: editingCalculatedFieldId ?? crypto.randomUUID(),
        kind: "conditionalSum",
        name,
      };
      return editingCalculatedFieldId
        ? replaceCalculatedField(current, nextField)
        : [...current, nextField];
    });
    updateBindingsForCalculatedFieldRename(name);
    setConditionalSumDraft(null);
    setEditingCalculatedFieldId(null);
  }

  function appendFormulaOperator(operator: CalculationOperator) {
    if (!calculationDraft || calculationDraft.formula.at(-1)?.kind !== "field")
      return;
    const lastField = calculationDraft.formula.at(-1);
    const currentIndex =
      lastField?.kind === "field"
        ? calculableSheetPaths.findIndex(
            ({ sheet }) => sheet.id === lastField.sheetId,
          )
        : -1;
    const nextReachable =
      calculableSheetPaths[(currentIndex + 1) % calculableSheetPaths.length];
    const nextColumn = nextReachable
      ? (numericFieldNames(nextReachable.sheet)[0] ?? "")
      : "";
    if (!nextReachable || !nextColumn) return;
    setCalculationDraft(
      (current) =>
        current && {
          ...current,
          formula: [
            ...current.formula,
            { kind: "operator", operator },
            {
              kind: "field",
              sheetId: nextReachable.sheet.id,
              column: nextColumn,
              relationPath: nextReachable.relationPath,
            },
          ],
        },
    );
  }

  function updateFormulaField(index: number, encodedField: string) {
    const [sheetId, column, relationPath] = JSON.parse(encodedField) as [
      string,
      string,
      string[],
    ];
    setCalculationDraft(
      (current) =>
        current && {
          ...current,
          formula: current.formula.map((token, tokenIndex) =>
            tokenIndex === index
              ? { kind: "field", sheetId, column, relationPath }
              : token,
          ),
        },
    );
  }

  function updateFormulaOperator(index: number, operator: CalculationOperator) {
    setCalculationDraft(
      (current) =>
        current && {
          ...current,
          formula: current.formula.map((token, tokenIndex) =>
            tokenIndex === index ? { kind: "operator", operator } : token,
          ),
        },
    );
  }

  function removeLastFormulaTerm() {
    setCalculationDraft((current) =>
      current && current.formula.length > 1
        ? { ...current, formula: current.formula.slice(0, -2) }
        : current,
    );
  }

  function saveCalculatedField() {
    if (!calculationDraft?.name.trim()) return;
    const name = calculationDraft.name.trim();
    if (
      activeSheet.columns.includes(name) ||
      activeCalculatedFields.some(
        (field) => field.name === name && field.id !== editingCalculatedFieldId,
      )
    )
      return;
    setCalculatedFields((current) => {
      const nextField: ArithmeticCalculatedField = {
        id: editingCalculatedFieldId ?? crypto.randomUUID(),
        name,
        resultSheetId: activeSheet.id,
        relationIds: calculationDraft.relationIds,
        formula: calculationDraft.formula,
      };
      return editingCalculatedFieldId
        ? replaceCalculatedField(current, nextField)
        : [...current, nextField];
    });
    updateBindingsForCalculatedFieldRename(name);
    setCalculationDraft(null);
    setEditingCalculatedFieldId(null);
  }

  function deleteCalculatedField(field: CalculatedField) {
    const dependents = calculatedFields.filter(
      (candidate) =>
        !isConditionalSumField(candidate) &&
        candidate.formula.some(
          (token) =>
            token.kind === "field" &&
            token.sheetId === field.resultSheetId &&
            token.column === field.name,
        ),
    );
    if (dependents.length > 0) {
      window.alert(
        `'${field.name}'을(를) 사용하는 계산 컬럼: ${dependents
          .map((item) => item.name)
          .join(", ")}`,
      );
      return;
    }
    if (!window.confirm(`'${field.name}' 계산 필드를 삭제할까요?`)) return;
    setCalculatedFields((current) =>
      current.filter((item) => item.id !== field.id),
    );
    setDisplayBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, binding]) => [
          itemId,
          binding.sheetId === field.resultSheetId
            ? {
                ...binding,
                field: binding.field === field.name ? "" : binding.field,
                fields: binding.fields.filter((name) => name !== field.name),
              }
            : binding,
        ]),
      ),
    );
  }

  function addPage() {
    let sequence = pages.length + 1;
    while (pages.some((page) => page.name === `페이지 ${sequence}`)) sequence++;
    const page: BuilderPage = {
      id: `page-${crypto.randomUUID()}`,
      name: `페이지 ${sequence}`,
      path: `/page-${sequence}`,
      items: [
        {
          id: `heading-page-${sequence}`,
          kind: "text",
          label: `새 페이지 ${sequence}`,
          subtitle: "페이지에 표시할 설명을 입력하세요.",
          showSubtitle: true,
        },
      ],
    };
    setPages((current) => [...current, page]);
    setActivePageId(page.id);
    setSelectedId(page.items[0].id);
    setPropertiesOpen(true);
  }

  function deletePage(pageToDelete: BuilderPage) {
    if (
      pages.length <= 1 ||
      !window.confirm(`'${pageToDelete.name}' 페이지를 삭제할까요?`)
    )
      return;
    const remaining = pages.filter((page) => page.id !== pageToDelete.id);
    setPages(remaining);
    setEditingPageId(null);
    setDisplayBindings((current) => {
      const next = { ...current };
      pageToDelete.items.forEach((item) => delete next[item.id]);
      return next;
    });
    if (activePageId === pageToDelete.id) {
      const nextPage = remaining[0];
      setActivePageId(nextPage.id);
      setSelectedId(nextPage.items[0]?.id ?? "");
      setPropertiesOpen(false);
    }
  }

  function selectPage(pageId: string) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;
    setActivePageId(pageId);
    setSelectedId(page.items[0]?.id ?? "");
    setPropertiesOpen(false);
  }

  function startPageRename(page: BuilderPage) {
    setEditingPageId(page.id);
    setPageNameDraft(page.name);
  }

  function finishPageRename() {
    if (!editingPageId) return;
    const name = pageNameDraft.trim();
    if (name)
      setPages((current) =>
        current.map((page) =>
          page.id === editingPageId ? { ...page, name } : page,
        ),
      );
    setEditingPageId(null);
  }

  function changeZoom(delta: number) {
    setCanvasView((current) => ({
      ...current,
      zoom: Math.min(
        1.8,
        Math.max(0.35, Number((current.zoom + delta).toFixed(2))),
      ),
    }));
  }

  function startPan(event: React.PointerEvent<HTMLElement>) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".canvas-ui-item")
    )
      return;
    pannedCanvasRef.current = false;
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasView.x,
      originY: canvasView.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent<HTMLElement>) {
    const pan = panRef.current;
    if (!pan) return;
    if (Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) >= 4)
      pannedCanvasRef.current = true;
    setCanvasView((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    }));
  }

  function stopPan(event: React.PointerEvent<HTMLElement>) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLElement>) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey)
      changeZoom(event.deltaY > 0 ? -0.08 : 0.08);
    else
      setCanvasView((current) => ({
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
  }

  function clearCanvasSelection() {
    if (pannedCanvasRef.current) {
      pannedCanvasRef.current = false;
      return;
    }
    setSelectedId("");
    setPropertiesOpen(false);
  }

  function clearPageSelection(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    clearCanvasSelection();
  }

  function resizeSheetDock(nextHeight: number) {
    const maxHeight = Math.max(260, window.innerHeight - 210);
    const height = Math.min(maxHeight, Math.max(150, nextHeight));
    normalSheetDockHeightRef.current = height;
    setSheetDockHeight(height);
  }

  function toggleSheetDockMinimized() {
    setSheetSearchOpen(false);
    if (sheetDockMode === "minimized") {
      setSheetDockHeight(normalSheetDockHeightRef.current);
      setSheetDockMode("normal");
      return;
    }
    if (sheetDockMode === "normal")
      normalSheetDockHeightRef.current = sheetDockHeight;
    setSheetDockMode("minimized");
  }

  function toggleSheetDockMaximized() {
    setSheetSearchOpen(false);
    if (sheetDockMode === "maximized") {
      setSheetDockHeight(normalSheetDockHeightRef.current);
      setSheetDockMode("normal");
      return;
    }
    if (sheetDockMode === "normal")
      normalSheetDockHeightRef.current = sheetDockHeight;
    setSheetDockMode("maximized");
  }

  function toggleSheetSearch() {
    if (sheetDockMode === "minimized") {
      setSheetDockHeight(normalSheetDockHeightRef.current);
      setSheetDockMode("normal");
    }
    setSheetSearchOpen((current) => !current);
  }

  function selectSearchedSheet(sheetId: string) {
    setActiveSheetId(sheetId);
    setSheetSearchQuery("");
    setSheetSearchOpen(false);
  }

  function startSheetDockResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = sheetDockHeight;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      resizeSheetDock(startHeight + startY - moveEvent.clientY);
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function startResize(
    event: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
    direction: ResizeDirection,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget.closest(".canvas-ui-item");
    if (!target) return;
    beginProjectHistoryInteraction();
    const rect = target.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width / canvasView.zoom;
    const startHeight = rect.height / canvasView.zoom;
    const zoom = canvasView.zoom;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;
      const horizontal = direction.includes("e")
        ? deltaX
        : direction.includes("w")
          ? -deltaX
          : 0;
      const vertical = direction.includes("s")
        ? deltaY
        : direction.includes("n")
          ? -deltaY
          : 0;
      const width = Math.max(100, Math.round(startWidth + horizontal));
      const height = Math.max(36, Math.round(startHeight + vertical));
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                ...(direction === "n" || direction === "s" ? {} : { width }),
                ...(direction === "e" || direction === "w" ? {} : { height }),
              }
            : currentItem,
        ),
      );
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      endProjectHistoryInteraction();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function startItemMove(
    event: React.PointerEvent<HTMLElement>,
    item: CanvasItem,
  ) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".resize-handle")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    beginProjectHistoryInteraction();
    movedItemRef.current = false;
    const index = items.findIndex((candidate) => candidate.id === item.id);
    const origin = itemPosition(item, index);
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = canvasView.zoom;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      if (
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4
      )
        return;
      movedItemRef.current = true;
      const x = Math.max(
        0,
        Math.round(origin.x + (moveEvent.clientX - startX) / zoom),
      );
      const y = Math.max(
        0,
        Math.round(origin.y + (moveEvent.clientY - startY) / zoom),
      );
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, x, y } : currentItem,
        ),
      );
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      endProjectHistoryInteraction();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  return (
    <div
      className={`studio ui-studio sheet-dock-${sheetDockMode}`}
      style={{
        gridTemplateRows:
          sheetDockMode === "minimized"
            ? "62px minmax(0, 1fr) 38px"
            : sheetDockMode === "maximized"
              ? "62px 0 minmax(0, 1fr)"
              : `62px minmax(180px, 1fr) ${sheetDockHeight}px`,
      }}
    >
      <header className="studio-topbar">
        <div className="studio-title">
          {editingProjectName ? (
            <input
              className="project-name-input"
              value={projectNameDraft}
              maxLength={120}
              autoFocus
              aria-label="프로젝트 이름"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              onBlur={saveProjectName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") cancelProjectRename();
              }}
            />
          ) : (
            <button
              className="project-name-button"
              type="button"
              title="더블클릭하여 프로젝트 이름 변경"
              onDoubleClick={startProjectRename}
            >
              {displayProjectName}
            </button>
          )}
        </div>
        <div className="studio-actions">
          <div
            className="project-history-actions"
            aria-label="프로젝트 편집 기록"
          >
            <button
              className="button secondary compact history-button"
              type="button"
              onClick={undoProject}
              disabled={!projectHistoryControls.canUndo}
              aria-label="이전 편집으로 돌아가기"
              title="이전 편집으로 돌아가기 (⌘Z / Ctrl+Z)"
            >
              <Icons.undo />
            </button>
            <button
              className="button secondary compact history-button"
              type="button"
              onClick={redoProject}
              disabled={!projectHistoryControls.canRedo}
              aria-label="다시 앞으로 가기"
              title="다시 앞으로 가기 (⇧⌘Z / Ctrl+Y)"
            >
              <Icons.redo />
            </button>
          </div>
          <span className="saved">
            <Icons.check />
            {saveStatus}
          </span>
          {!isTemporary && !hasPassword && (
            <button
              className="button secondary compact topbar-action-icon"
              type="button"
              onClick={() => openSecurityDialog("set-pin")}
              aria-label="비밀번호 설정"
              title="비밀번호 설정"
            >
              <Icons.lock />
            </button>
          )}
          {!isTemporary && (
            <button
              className="button compact topbar-action-icon danger-icon"
              type="button"
              onClick={() => openSecurityDialog("delete")}
              aria-label="프로젝트 삭제"
              title="프로젝트 삭제"
            >
              <Icons.trash />
            </button>
          )}
          <button
            className={`button primary compact snapshot-trigger${isTemporary ? "" : " topbar-action-icon"}`}
            type="button"
            onClick={saveProjectSnapshot}
            disabled={snapshotLoading || !!restoringSnapshotId}
            aria-label={isTemporary ? "프로젝트로 저장" : snapshotLoading ? "스냅샷 저장 중" : "스냅샷"}
            title={isTemporary ? "저장하려면 프로젝트를 만들어야 합니다" : "현재 프로젝트를 저장하고 스냅샷 기록 남기기"}
          >
            {isTemporary ? <Icons.plus /> : <Icons.clock />}
            {isTemporary ? "프로젝트로 저장" : null}
          </button>
        </div>
      </header>

      {!isTemporary && snapshotPanelOpen && (
        <aside className="snapshot-panel" aria-label="프로젝트 스냅샷 기록">
          <header>
            <div>
              <span>PROJECT HISTORY</span>
              <h2>스냅샷 기록</h2>
              <p>저장한 시점의 프로젝트로 언제든 되돌아갈 수 있습니다.</p>
            </div>
            <button
              type="button"
              aria-label="스냅샷 기록 닫기"
              onClick={() => setSnapshotPanelOpen(false)}
            >
              ×
            </button>
          </header>
          {snapshotError && <p className="snapshot-error">{snapshotError}</p>}
          <div className="snapshot-list">
            {snapshotLoading && savedSnapshots.length === 0 ? (
              <p className="snapshot-empty">스냅샷을 저장하고 있습니다.</p>
            ) : savedSnapshots.length === 0 ? (
              <p className="snapshot-empty">아직 저장된 스냅샷이 없습니다.</p>
            ) : (
              savedSnapshots.map((snapshot, index) => (
                <article key={snapshot.id} className="snapshot-record">
                  <div className="snapshot-record-icon">
                    <Icons.clock />
                  </div>
                  <div>
                    <strong>
                      {snapshot.reason === "before_restore"
                        ? "복원 전 자동 저장"
                        : index === 0
                          ? "최신 스냅샷"
                          : "프로젝트 저장"}
                    </strong>
                    <time dateTime={snapshot.createdAt}>
                      {savedSnapshotTime(snapshot.createdAt)}
                    </time>
                    <small>프로젝트 버전 {snapshot.projectVersion}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreSavedSnapshot(snapshot)}
                    disabled={!!restoringSnapshotId || snapshotLoading}
                  >
                    {restoringSnapshotId === snapshot.id
                      ? "복원 중"
                      : "이 시점으로 복원"}
                  </button>
                </article>
              ))
            )}
          </div>
        </aside>
      )}

      <div
        className={`ui-builder-body ${paletteOpen ? "" : "palette-closed"} ${propertiesOpen ? "" : "properties-closed"}`}
      >
        <aside className="ui-palette">
          <div className="panel-heading">
            <div>
              <h2>컴포넌트</h2>
              <p>화면에 필요한 요소를 끌어다 놓으세요</p>
            </div>
            <button
              type="button"
              aria-label="컴포넌트 패널 숨기기"
              title="컴포넌트 패널 숨기기"
              onClick={() => setPaletteOpen(false)}
            >
              ×
            </button>
          </div>
          <label className="palette-search">
            <Icons.search />
            <input aria-label="컴포넌트 검색" placeholder="컴포넌트 검색" />
          </label>
          <div className="component-groups">
            {groups.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div>
                  {group.items.map((item) => (
                    <button
                      key={item.kind}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData("component-kind", item.kind)
                      }
                      onDoubleClick={() => addItem(item.kind)}
                    >
                      <span className={`component-glyph ${item.kind}`}>
                        {item.glyph}
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.caption}</small>
                      </span>
                      <i>⠿</i>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="palette-hint">
            <span>TIP</span> 더블클릭해도 캔버스에 추가할 수 있어요.
          </div>
        </aside>

        <main
          className="ui-workspace"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) =>
            addItem(
              event.dataTransfer.getData("component-kind") as ComponentKind,
            )
          }
        >
          {!paletteOpen && (
            <button
              type="button"
              className="palette-reopen"
              aria-label="컴포넌트 패널 열기"
              onClick={() => setPaletteOpen(true)}
            >
              <Icons.blocks />
              컴포넌트
            </button>
          )}
          <div className="workspace-bar">
            <div className="page-switcher">
              <span>페이지</span>
              {pages.map((page) => (
                <div
                  key={page.id}
                  className={`page-tab ${page.id === activePage.id ? "active" : ""}`}
                >
                  {editingPageId === page.id ? (
                    <input
                      className="page-name-input"
                      aria-label="페이지 이름"
                      value={pageNameDraft}
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setPageNameDraft(event.target.value)}
                      onBlur={finishPageRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          setEditingPageId(null);
                          setPageNameDraft(page.name);
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="page-tab-select"
                      onClick={() => selectPage(page.id)}
                      onDoubleClick={() => startPageRename(page)}
                      title="더블클릭하여 페이지 이름 변경"
                    >
                      {page.name}
                    </button>
                  )}
                  {pages.length > 1 && editingPageId !== page.id && (
                    <button
                      className="page-tab-close"
                      aria-label={`${page.name} 페이지 삭제`}
                      onClick={() => deletePage(page)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                className="add-page"
                onClick={addPage}
                aria-label="웹 페이지 추가"
              >
                <Icons.plus />
                페이지
              </button>
            </div>
            <div className="zoom-controls">
              <button onClick={() => changeZoom(-0.1)} aria-label="축소">
                −
              </button>
              <span>{Math.round(canvasView.zoom * 100)}%</span>
              <button onClick={() => changeZoom(0.1)} aria-label="확대">
                ＋
              </button>
              <button
                onClick={() => setCanvasView({ x: 100, y: 55, zoom: 0.9 })}
                aria-label="캔버스 위치 초기화"
              >
                ⌖
              </button>
            </div>
          </div>
          <div
            className="canvas-viewport"
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={stopPan}
            onPointerCancel={stopPan}
            onWheel={handleCanvasWheel}
            onClick={clearCanvasSelection}
          >
            <div
              className="canvas-stage"
              style={{
                transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.zoom})`,
              }}
            >
              <div className="web-canvas">
                <div className="browser-chrome">
                  <i />
                  <i />
                  <i />
                  <span>app.aporia.dev{activePage.path}</span>
                </div>
                <div className="mock-app">
                  <section className="mock-page">
                    <div
                      className="mock-content"
                      onClick={clearPageSelection}
                    >
                      <div
                        className="mock-layout"
                        style={{ minHeight: `${canvasContentHeight}px` }}
                      >
                        {items.map((item, index) => {
                          const position = itemPosition(item, index);
                          return (
                            <div
                              key={item.id}
                              data-item-id={item.id}
                              style={{
                                left: `${position.x}px`,
                                top: `${position.y}px`,
                                width: `${item.width ?? defaultItemWidth(item.kind)}px`,
                                height: item.height
                                  ? `${item.height}px`
                                  : undefined,
                              }}
                              className={`canvas-ui-item kind-${item.kind} ${selectedId === item.id && propertiesOpen ? "selected" : ""}`}
                              onPointerDown={(event) =>
                                startItemMove(event, item)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (movedItemRef.current) {
                                  movedItemRef.current = false;
                                  return;
                                }
                                if (selectedId === item.id && propertiesOpen)
                                  setPropertiesOpen(false);
                                else {
                                  setSelectedId(item.id);
                                  setPropertiesOpen(true);
                                }
                              }}
                            >
                              <span className="selection-label">
                                {item.kind}
                              </span>
                              <RenderItem
                                item={item}
                                sheets={sheets}
                                sheetRelations={sheetRelations}
                                calculatedFields={calculatedFields}
                                binding={displayBindings[item.id]}
                              />
                              {selectedId === item.id && propertiesOpen && (
                                <div
                                  className="resize-handles"
                                  aria-label="컴포넌트 크기 조절"
                                >
                                  {resizeDirections.map((direction) => (
                                    <button
                                      key={direction}
                                      className={`resize-handle handle-${direction}`}
                                      aria-label={`${direction} 방향 크기 조절`}
                                      onPointerDown={(event) =>
                                        startResize(event, item, direction)
                                      }
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </main>

        {propertiesOpen && (
          <aside className="ui-properties">
            <div className="property-head">
              <div>
                <h2>속성</h2>
                <p>선택한 컴포넌트의 설정</p>
              </div>
              <button
                aria-label="속성 닫기"
                onClick={() => setPropertiesOpen(false)}
              >
                ×
              </button>
            </div>
            {selected && (
              <div className="ui-property-content">
                <div className="selected-component">
                  <span className={`component-glyph ${selected.kind}`}>
                    {
                      groups
                        .flatMap((g) => g.items)
                        .find((i) => i.kind === selected.kind)?.glyph
                    }
                  </span>
                  <div>
                    <small>{selected.kind.toUpperCase()}</small>
                    <strong>{selected.label}</strong>
                  </div>
                </div>
                <div className="property-tabs">
                  <button
                    className={propertyTab === "design" ? "active" : ""}
                    onClick={() => setPropertyTab("design")}
                  >
                    디자인
                  </button>
                  <button
                    className={propertyTab === "data" ? "active" : ""}
                    onClick={() => setPropertyTab("data")}
                  >
                    데이터
                  </button>
                  <button
                    className={propertyTab === "action" ? "active" : ""}
                    onClick={() => setPropertyTab("action")}
                  >
                    동작
                  </button>
                </div>
                {propertyTab === "data" &&
                (selected.kind === "table" || selected.kind === "text") ? (
                  <>
                    <ComponentDataPanel
                      item={selected}
                      sheets={sheets}
                      calculatedFields={calculatedFields}
                      binding={displayBindings[selected.id]}
                      onChange={(binding) =>
                        setDisplayBindings((current) => ({
                          ...current,
                          [selected.id]: binding,
                        }))
                      }
                      onRemove={() =>
                        setDisplayBindings((current) => {
                          const next = { ...current };
                          delete next[selected.id];
                          return next;
                        })
                      }
                    />
                    {sheets.length > 1 && (
                      <details className="relation-details">
                        <summary>여러 시트 연결 설정</summary>
                        <DataBindingPanel
                          sheets={sheets}
                          config={dataBinding}
                          onChange={setDataBinding}
                        />
                      </details>
                    )}
                  </>
                ) : propertyTab === "action" ? (
                  <div className="empty-property">
                    <Icons.bolt />
                    <strong>실행할 동작</strong>
                    <p>클릭이나 값 변경 시 실행할 작업을 연결하세요.</p>
                    <button className="condition-button">
                      <Icons.plus />
                      동작 추가
                    </button>
                  </div>
                ) : (
                  <>
                    <section>
                      <h3>내용</h3>
                      <label>
                        라벨
                        <input
                          value={selected.label}
                          onChange={(event) => updateLabel(event.target.value)}
                        />
                      </label>
                      {selected.kind === "text" && (
                        <>
                          <label>
                            텍스트 크기
                            <div className="font-size-control">
                              <input
                                aria-label="텍스트 크기 슬라이더"
                                type="range"
                                min="10"
                                max="72"
                                value={selected.fontSize ?? 17}
                                onChange={(event) =>
                                  updateFontSize(Number(event.target.value))
                                }
                              />
                              <input
                                aria-label="텍스트 크기"
                                type="number"
                                min="10"
                                max="72"
                                value={selected.fontSize ?? 17}
                                onChange={(event) =>
                                  updateFontSize(Number(event.target.value))
                                }
                              />
                              <span>px</span>
                            </div>
                          </label>
                          <label className="subtitle-toggle">
                            <span>
                              <strong>소제목</strong>
                              <small>제목 아래에 설명을 표시합니다.</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={selected.showSubtitle !== false}
                              onChange={(event) =>
                                updateSubtitleVisibility(event.target.checked)
                              }
                            />
                            <i />
                          </label>
                          {selected.showSubtitle !== false && (
                            <label>
                              소제목 내용
                              <input
                                value={selected.subtitle ?? ""}
                                placeholder="제목 아래에 표시할 설명"
                                onChange={(event) =>
                                  updateSubtitle(event.target.value)
                                }
                              />
                            </label>
                          )}
                        </>
                      )}
                      {selected.kind === "button" && (
                        <label>
                          버튼 스타일
                          <select defaultValue="primary">
                            <option value="primary">주요 버튼</option>
                            <option value="secondary">보조 버튼</option>
                          </select>
                        </label>
                      )}
                    </section>
                    <section>
                      <h3>표시 조건</h3>
                      <button className="condition-button">
                        <Icons.plus />
                        조건 추가
                      </button>
                      <p className="property-help">
                        로그인 상태나 데이터 값에 따라 이 컴포넌트를 보이거나
                        숨길 수 있습니다.
                      </p>
                    </section>
                    <button
                      className="delete-component"
                      onClick={() => {
                        setItems((current) =>
                          current.filter((item) => item.id !== selectedId),
                        );
                        setSelectedId("");
                        setDisplayBindings((current) => {
                          const next = { ...current };
                          delete next[selectedId];
                          return next;
                        });
                      }}
                    >
                      컴포넌트 삭제
                    </button>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
      <section
        className={`sheet-dock ${sheetDockMode}`}
        aria-label="데이터 시트"
      >
        <div
          role="separator"
          tabIndex={0}
          className="sheet-dock-resizer"
          aria-label="데이터 시트 높이 조절"
          aria-orientation="horizontal"
          aria-valuemin={150}
          aria-valuemax={Math.max(260, sheetDockHeight)}
          aria-valuenow={sheetDockHeight}
          onPointerDown={startSheetDockResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              resizeSheetDock(sheetDockHeight + 24);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              resizeSheetDock(sheetDockHeight - 24);
            }
          }}
        >
          <span />
        </div>
        <div className="sheet-tabs">
          <div className="sheet-title">
            <Icons.database />
            <strong>데이터</strong>
            <div className="sheet-view-toggle" aria-label="데이터 보기 방식">
              <button
                type="button"
                className={sheetViewMode === "grid" ? "active" : ""}
                aria-pressed={sheetViewMode === "grid"}
                onClick={() => setSheetViewMode("grid")}
              >
                시트
              </button>
              <button
                type="button"
                className={sheetViewMode === "erd" ? "active" : ""}
                aria-pressed={sheetViewMode === "erd"}
                onClick={() => setSheetViewMode("erd")}
              >
                ERD
              </button>
            </div>
            <div className="sheet-window-controls">
              <button
                type="button"
                aria-label={
                  sheetDockMode === "minimized"
                    ? "데이터 시트 원래 크기로 복원"
                    : "데이터 시트 최소화"
                }
                title={
                  sheetDockMode === "minimized" ? "원래 크기" : "최소화"
                }
                onClick={toggleSheetDockMinimized}
              >
                _
              </button>
              <button
                type="button"
                aria-label={
                  sheetDockMode === "maximized"
                    ? "데이터 시트 원래 크기로 복원"
                    : "데이터 시트 최대화"
                }
                title={
                  sheetDockMode === "maximized" ? "원래 크기" : "최대화"
                }
                onClick={toggleSheetDockMaximized}
              >
                {sheetDockMode === "maximized" ? "❐" : "□"}
              </button>
              <button
                type="button"
                aria-label="데이터 시트 검색"
                title="시트 검색"
                aria-expanded={sheetSearchOpen}
                onClick={toggleSheetSearch}
              >
                <Icons.search />
              </button>
            </div>
          </div>
          {sheets.map((sheet) => {
            const tabRelations = sheetRelations.filter(
              (relation) =>
                relation.sourceSheetId === sheet.id ||
                relation.targetSheetId === sheet.id,
            );
            const relationSummary = tabRelations
              .map((relation) => {
                const isSource = relation.sourceSheetId === sheet.id;
                const relatedSheet = sheets.find(
                  (candidate) =>
                    candidate.id ===
                    (isSource
                      ? relation.targetSheetId
                      : relation.sourceSheetId),
                );
                return `${isSource ? "→" : "←"} ${relatedSheet?.name ?? "삭제된 시트"} (${relation.relationType})`;
              })
              .join("\n");
            return (
              <div
                key={sheet.id}
                className={`sheet-tab ${activeSheet.id === sheet.id ? "active" : ""}`}
              >
              {editingSheetId === sheet.id ? (
                <div className="sheet-tab-select sheet-tab-name-editor">
                  <span className="table-dot" />
                  <input
                    aria-label={`${sheet.name} 시트 이름`}
                    value={sheetNameDraft}
                    autoFocus
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setSheetNameDraft(event.target.value)}
                    onBlur={() => {
                      if (cancelSheetRenameRef.current) {
                        cancelSheetRenameRef.current = false;
                        return;
                      }
                      saveSheetName();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveSheetName();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelSheetRename();
                      }
                    }}
                  />
                  <small>{sheet.rows.length}</small>
                </div>
              ) : (
                <button
                  className="sheet-tab-select"
                  title="더블클릭하여 시트 이름 변경"
                  onClick={(event) => {
                    setActiveSheetId(sheet.id);
                    if (event.detail === 2) startSheetRename(sheet);
                  }}
                >
                  <span className="table-dot" />
                  {sheet.name}
                  <small>{sheet.rows.length}</small>
                </button>
              )}
              {sheets.length > 1 && (
                <button
                  className={`sheet-tab-relation${tabRelations.length > 0 ? " has-relations" : ""}`}
                  aria-label={`${sheet.name} 관계 설정${tabRelations.length > 0 ? `, ${tabRelations.length}개 관계` : ""}`}
                  title={
                    tabRelations.length > 0
                      ? `설정된 관계 ${tabRelations.length}개\n${relationSummary}`
                      : "관계 설정"
                  }
                  onClick={() => startRelationForSheet(sheet.id)}
                >
                  <span aria-hidden="true">↔</span>
                  {tabRelations.length > 0 && (
                    <small aria-hidden="true">{tabRelations.length}</small>
                  )}
                </button>
              )}
              <button
                className="sheet-tab-close"
                aria-label={`${sheet.name} 시트 삭제`}
                onClick={() => deleteSheet(sheet)}
              >
                ×
              </button>
              </div>
            );
          })}
          <button
            className="add-sheet"
            onClick={addSheet}
            aria-label="새 테이블 시트 추가"
          >
            <Icons.plus />
          </button>
          <span className="sheet-summary">테이블 {sheets.length}개</span>
        </div>
        {sheetSearchOpen && (
          <div
            className="sheet-search-popover"
            role="dialog"
            aria-label="시트 찾기"
          >
            <label>
              <Icons.search />
              <input
                autoFocus
                aria-label="시트 이름 검색"
                placeholder="시트 이름 검색"
                value={sheetSearchQuery}
                onChange={(event) => setSheetSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSheetSearchOpen(false);
                }}
              />
            </label>
            <div className="sheet-search-results">
              {sheetSearchResults.length === 0 ? (
                <p>일치하는 시트가 없습니다.</p>
              ) : (
                sheetSearchResults.map((sheet) => (
                  <button
                    key={sheet.id}
                    type="button"
                    className={sheet.id === activeSheet.id ? "active" : ""}
                    onClick={() => selectSearchedSheet(sheet.id)}
                  >
                    <span className="table-dot" />
                    <strong>{sheet.name}</strong>
                    <small>{sheet.rows.length}개 행</small>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        {sheets.length === 0 ? (
          <div className="empty-sheet-state">
            <Icons.database />
            <div>
              <strong>아직 데이터 시트가 없습니다</strong>
              <span>새 시트를 만들어 화면에 사용할 데이터를 입력하세요.</span>
            </div>
            <button onClick={addSheet}>
              <Icons.plus /> 새 시트 만들기
            </button>
          </div>
        ) : (
          sheetViewMode === "erd" ? (
            <>
              <SheetErdView
                sheets={sheets}
                relations={sheetRelations}
                activeSheetId={activeSheet.id}
                onSelectSheet={setActiveSheetId}
              />
              <footer className="sheet-footer">
                <span>
                  <b>ERD</b> 보기
                </span>
                <span>테이블 {sheets.length}개</span>
                <span>관계 {sheetRelations.length}개</span>
                <span className="sheet-saved">보기 전용</span>
              </footer>
            </>
          ) : (
          <>
            <div className="sheet-grid-wrap">
              <table className="sheet-grid">
                <thead>
                  <tr>
                    <th className="row-number corner">#</th>
                    {activeSheet.columns.map((column, index) => (
                      <th
                        key={`${column}-${index}`}
                        className="editable-column"
                      >
                        <span className="field-number">#{index + 1}</span>
                        <span className="field-type">
                          {columnTypeLabel(columnType(activeSheet, index))}
                        </span>
                        {column}
                        {(() => {
                          const relation = sheetRelations.find(
                            (item) =>
                              (item.sourceSheetId === activeSheet.id &&
                                item.sourceColumn === column) ||
                              (item.targetSheetId === activeSheet.id &&
                                item.targetColumn === column),
                          );
                          const otherSheetId =
                            relation?.sourceSheetId === activeSheet.id
                              ? relation.targetSheetId
                              : relation?.sourceSheetId;
                          const otherSheet = sheets.find(
                            (sheet) => sheet.id === otherSheetId,
                          );
                          return (
                            relation && (
                              <span className="relation-chip">
                                ↔ {otherSheet?.name}
                              </span>
                            )
                          );
                        })()}
                        <button
                          aria-label={`${column} 필드 편집`}
                          onClick={() => startColumnEdit(index)}
                        >
                          ⌄
                        </button>
                        {editingColumnIndex === index && (
                          <div className="column-editor">
                            <label>
                              필드 이름
                              <input
                                aria-label="필드 이름"
                                value={columnNameDraft}
                                autoFocus
                                onChange={(event) =>
                                  setColumnNameDraft(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") saveColumnName();
                                  if (event.key === "Escape")
                                    setEditingColumnIndex(null);
                                }}
                              />
                            </label>
                            <div>
                              <button onClick={saveColumnName}>저장</button>
                              <button
                                onClick={() => deleteColumn(index)}
                                disabled={activeSheet.columns.length <= 1}
                              >
                                필드 삭제
                              </button>
                            </div>
                          </div>
                        )}
                      </th>
                    ))}
                    {activeCalculatedFields.map((field, index) => (
                      <th key={field.id} className="calculated-column">
                        <button
                          className="calculated-column-details"
                          aria-label={`${field.name} 계산식 보기`}
                          onClick={() => setInspectingCalculatedField(field)}
                        >
                          <span className="field-number">
                            #{activeSheet.columns.length + index + 1}
                          </span>
                          <span className="field-type fx">fx</span>
                          <span>{field.name}</span>
                        </button>
                        <button
                          className="calculated-column-delete"
                          aria-label={`${field.name} 계산 필드 삭제`}
                          onClick={() => deleteCalculatedField(field)}
                        >
                          ×
                        </button>
                      </th>
                    ))}
                    <th className="add-column">
                      <button
                        aria-label="필드 추가"
                        aria-expanded={fieldMenuOpen}
                        onClick={() => setFieldMenuOpen((current) => !current)}
                      >
                        <Icons.plus /> 필드
                      </button>
                      {fieldMenuOpen && (
                        <div
                          className="field-add-menu"
                          role="menu"
                          aria-label="필드 종류 선택"
                        >
                          <button
                            role="menuitem"
                            onClick={() => {
                              setFieldMenuOpen(false);
                              startColumnCreation();
                            }}
                          >
                            <span className="field-menu-icon">T</span>
                            <span>
                              <strong>일반 필드</strong>
                              <small>값을 직접 입력하는 필드</small>
                            </span>
                          </button>
                          <button
                            role="menuitem"
                            disabled={!canCreateConditionalSum}
                            onClick={() => {
                              const target = aggregateSheetPaths[0]!;
                              const valueColumn = numericColumns(
                                target.sheet,
                              )[0]!;
                              setConditionalSumDraft({
                                name: `${target.sheet.name} ${valueColumn} 합계`,
                                resultSheetId: activeSheet.id,
                                sourceSheetId: target.sheet.id,
                                relationPath: target.relationPath,
                                valueColumn,
                                conditions: [
                                  {
                                    id: crypto.randomUUID(),
                                    sheetId: target.sheet.id,
                                    relationPath: target.relationPath,
                                    column: target.sheet.columns[0]!,
                                    operator: "eq",
                                    operand: { kind: "literal", value: "" },
                                  },
                                ],
                              });
                              setEditingCalculatedFieldId(null);
                              setFieldMenuOpen(false);
                            }}
                          >
                            <span className="field-menu-icon fx">∑</span>
                            <span>
                              <strong>조건에 맞는 값 더하기</strong>
                              <small>
                                {canCreateConditionalSum
                                  ? "현재 시트의 각 행마다 연결된 데이터를 찾아 더해요"
                                  : "먼저 숫자 필드가 있는 시트와 관계를 만들어주세요"}
                              </small>
                            </span>
                          </button>
                          <button
                            role="menuitem"
                            disabled={!canCreateCalculation}
                            onClick={() => {
                              setFieldMenuOpen(false);
                              startCalculation();
                            }}
                          >
                            <span className="field-menu-icon fx">fx</span>
                            <span>
                              <strong>계산 필드</strong>
                              <small>
                                {canCreateCalculation
                                  ? `관계를 따라 ${calculableSheetPaths.length}개 시트의 숫자를 사용할 수 있어요`
                                  : reachableSheetPaths.length > 1
                                    ? "계산할 숫자 필드를 먼저 추가해주세요"
                                    : allActiveRelations.length > 0
                                      ? "상대 시트에 여러 행이 연결되어 사용할 수 없어요"
                                      : "먼저 다른 시트와 관계를 만들어주세요"}
                              </small>
                            </span>
                          </button>
                        </div>
                      )}
                    </th>
                    <th className="row-actions-head">행</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.rows.map((row, rowIndex) => (
                    <tr
                      key={
                        activeSheet.rowIds[rowIndex] ??
                        `${activeSheet.id}-${rowIndex}`
                      }
                    >
                      <th className="row-number">{rowIndex + 1}</th>
                      {activeSheet.columns.map((column, columnIndex) => {
                        const rowId =
                          activeSheet.rowIds[rowIndex] ?? String(rowIndex);
                        const errorKey = `${activeSheet.id}:${rowId}:${columnIndex}`;
                        const validationError = cellValidationErrors[errorKey];
                        const errorId = `cell-error-${rowId}-${columnIndex}`;
                        return (
                        <td key={column} className={validationError ? "invalid-cell" : undefined}>
                          {activeSheet.columnTypes?.[columnIndex] ===
                          "boolean" ? (
                            <select
                              aria-label={`${rowIndex + 1}행 ${column}`}
                              aria-invalid={validationError ? true : undefined}
                              aria-describedby={validationError ? errorId : undefined}
                              onFocus={() => clearCellValidationError(errorKey)}
                              value={row[columnIndex] || "아니오"}
                              onChange={(event) =>
                                updateCell(
                                  rowIndex,
                                  columnIndex,
                                  event.target.value,
                                )
                              }
                            >
                              <option>예</option>
                              <option>아니오</option>
                            </select>
                          ) : (
                            <input
                              type={
                                "text"
                              }
                              aria-label={`${rowIndex + 1}행 ${column}`}
                              aria-invalid={validationError ? true : undefined}
                              aria-describedby={validationError ? errorId : undefined}
                              onFocus={() => clearCellValidationError(errorKey)}
                              placeholder={
                                activeSheet.columnTypes?.[columnIndex] === "date"
                                  ? "YYYY-MM-DD"
                                  : undefined
                              }
                              inputMode={
                                activeSheet.columnTypes?.[columnIndex] ===
                                "number"
                                  ? "decimal"
                                  : undefined
                              }
                              value={
                                row[columnIndex] ?? ""
                              }
                              onChange={(event) =>
                                updateCell(
                                  rowIndex,
                                  columnIndex,
                                  event.target.value,
                                )
                              }
                            />
                          )}
                          {validationError && (
                            <small id={errorId} className="cell-validation-error" role="alert">
                              {validationError}
                            </small>
                          )}
                        </td>
                        );
                      })}
                      {activeCalculatedFields.map((field) => {
                        return (
                          <td key={field.id} className="calculated-cell">
                            {calculateFieldValue(
                              field,
                              sheetRelations,
                              sheets,
                              activeSheet.rowIds[rowIndex],
                              calculatedFields,
                            )}
                          </td>
                        );
                      })}
                      <td />
                      <td className="row-actions">
                        <button
                          aria-label={`${rowIndex + 1}행 삭제`}
                          onClick={() => deleteRow(rowIndex)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="new-row">
                    <th className="row-number">
                      <Icons.plus />
                    </th>
                    <td
                      colSpan={
                        activeSheet.columns.length +
                        activeCalculatedFields.length +
                        2
                      }
                    >
                      <button onClick={addRow}>새 행 추가</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <footer className="sheet-footer">
              <span>
                <b>{activeSheet.name}</b> 테이블
              </span>
              {editingSheetId !== activeSheet.id && (
                <button
                  className="sheet-footer-action"
                  onClick={() => startSheetRename()}
                >
                  이름 변경
                </button>
              )}
              <button
                className="sheet-footer-action developer-spec-trigger"
                onClick={() => setDeveloperSpecOpen(true)}
              >
                개발 명세 보기
              </button>
              <span>
                필드{" "}
                {activeSheet.columns.length + activeCalculatedFields.length}개
              </span>
              <span>데이터 {activeSheet.rows.length}개</span>
              <span className="sheet-saved">
                <Icons.check />
                {isTemporary ? "임시 데이터" : "자동 저장됨"}
              </span>
            </footer>
          </>
          )
        )}
      </section>
      {developerSpecOpen &&
        (() => {
          const fieldsByName = new Map(
            activeCalculatedFields.map((field) => [field.name, field]),
          );
          const orderedFields: CalculatedField[] = [];
          const visited = new Set<string>();
          const visit = (field: CalculatedField) => {
            if (visited.has(field.id)) return;
            visited.add(field.id);
            if (!isConditionalSumField(field))
              field.formula.forEach((token) => {
                if (token.kind !== "field" || token.sheetId !== activeSheet.id)
                  return;
                const dependency = fieldsByName.get(token.column);
                if (dependency) visit(dependency);
              });
            orderedFields.push(field);
          };
          activeCalculatedFields.forEach(visit);
          const activeRelations = sheetRelations.filter(
            (relation) =>
              relation.sourceSheetId === activeSheet.id ||
              relation.targetSheetId === activeSheet.id,
          );
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setDeveloperSpecOpen(false);
              }}
            >
              <div
                className="relation-modal developer-spec-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${activeSheet.name} 개발 명세`}
              >
                <header>
                  <div>
                    <span className="developer-spec-badge">DEV</span>
                    <strong>{activeSheet.name} 개발 명세</strong>
                  </div>
                  <button
                    aria-label="개발 명세 닫기"
                    onClick={() => setDeveloperSpecOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <section className="developer-spec-summary">
                  <small>구현 대상</small>
                  <h2>{activeSheet.name} 시트</h2>
                  <p>
                    일반 필드 {activeSheet.columns.length}개, 관계 {activeRelations.length}개,
                    계산 규칙 {activeCalculatedFields.length}개를 구현합니다.
                  </p>
                  <div>
                    <span>행 단위 데이터 모델</span>
                    <span>관계 기반 참조</span>
                    <span>계산 순서 포함</span>
                  </div>
                </section>
                <section>
                  <small>1. 데이터 구조</small>
                  <h2>필드 명세</h2>
                  <div className="developer-spec-table-wrap">
                    <table className="developer-spec-table">
                      <thead>
                        <tr>
                          <th>필드</th>
                          <th>종류</th>
                          <th>설명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSheet.columns.map((column, index) => (
                          <tr key={column}>
                            <td>{column}</td>
                            <td>{columnTypeLabel(columnType(activeSheet, index))}</td>
                            <td>사용자가 입력하거나 외부 데이터에서 저장하는 값</td>
                          </tr>
                        ))}
                        {activeCalculatedFields.map((field) => (
                          <tr key={field.id}>
                            <td>{field.name}</td>
                            <td>계산 결과</td>
                            <td>
                              {isConditionalSumField(field)
                                ? "조건에 맞는 연결 데이터의 합계"
                                : "다른 필드를 참조한 파생 값"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section>
                  <small>2. 데이터 관계</small>
                  <h2>연결해야 하는 시트</h2>
                  {activeRelations.length === 0 ? (
                    <p className="developer-spec-empty">연결된 시트가 없습니다.</p>
                  ) : (
                    <div className="developer-spec-relations">
                      {activeRelations.map((relation) => {
                        const source = sheets.find(
                          (sheet) => sheet.id === relation.sourceSheetId,
                        );
                        const target = sheets.find(
                          (sheet) => sheet.id === relation.targetSheetId,
                        );
                        return (
                          <div key={relation.id}>
                            <strong>
                              {source?.name} · {relation.sourceColumn}
                            </strong>
                            <span>{relation.relationType}</span>
                            <strong>
                              {target?.name} · {relation.targetColumn}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                <section>
                  <small>3. 비즈니스 계산 규칙</small>
                  <h2>계산 순서와 기대 결과</h2>
                  {orderedFields.length === 0 ? (
                    <p className="developer-spec-empty">계산 규칙이 없습니다.</p>
                  ) : (
                    <ol className="developer-spec-rules">
                      {orderedFields.map((field, fieldIndex) => (
                        <li key={field.id}>
                          <div className="developer-spec-rule-title">
                            <span>{fieldIndex + 1}</span>
                            <strong>{field.name}</strong>
                            <em>
                              {isConditionalSumField(field)
                                ? "조건 합계"
                                : "파생 계산"}
                            </em>
                          </div>
                          {isConditionalSumField(field) ? (
                            <div className="developer-spec-formula">
                              <b>
                                {relationPathLabel(
                                  activeSheet,
                                  field.relationPath,
                                  sheetRelations,
                                  sheets,
                                )} · {field.valueColumn} 합계
                              </b>
                              {field.conditions.map((condition) => (
                                <p key={condition.id}>
                                  조건: {relationPathLabel(
                                    activeSheet,
                                    condition.relationPath ?? field.relationPath,
                                    sheetRelations,
                                    sheets,
                                  )} · {condition.column} {conditionalOperatorLabel(condition.operator)}{" "}
                                  {condition.operand.kind === "literal"
                                    ? condition.operand.value
                                    : `현재 행의 ${condition.operand.column}`}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <div className="developer-spec-formula formula-inline">
                              {field.formula.map((token, tokenIndex) =>
                                token.kind === "operator" ? (
                                  <span key={tokenIndex}>
                                    {token.operator === "*"
                                      ? "×"
                                      : token.operator === "/"
                                        ? "÷"
                                        : token.operator === "-"
                                          ? "−"
                                          : "+"}
                                  </span>
                                ) : (
                                  <b key={tokenIndex}>
                                    {relationPathLabel(
                                      activeSheet,
                                      token.relationPath ?? [],
                                      sheetRelations,
                                      sheets,
                                    )} · {token.column}
                                  </b>
                                ),
                              )}
                            </div>
                          )}
                          <div className="developer-spec-samples">
                            {activeSheet.rowIds.slice(0, 3).map((rowId, index) => (
                              <span key={rowId}>
                                {activeSheet.rows[index]?.[0] || `${index + 1}행`}
                                <strong>
                                  {calculateFieldValue(
                                    field,
                                    sheetRelations,
                                    sheets,
                                    rowId,
                                    calculatedFields,
                                  )}
                                </strong>
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <footer>
                  <button
                    className="confirm"
                    onClick={() => setDeveloperSpecOpen(false)}
                  >
                    확인
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      {securityDialog && (
        <div className="relation-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !securityLoading) setSecurityDialog(null); }}>
          <section className="security-dialog" role="dialog" aria-modal="true" aria-labelledby="security-dialog-title">
            <span>{securityDialog === "set-pin" ? "PROJECT SECURITY" : "DELETE PROJECT"}</span>
            <h2 id="security-dialog-title">{securityDialog === "set-pin" ? "4자리 비밀번호 설정" : "프로젝트 삭제"}</h2>
            <p>{securityDialog === "set-pin" ? "다음 입장부터 이 비밀번호를 입력해야 합니다." : hasPassword ? "삭제하려면 프로젝트 비밀번호를 다시 입력하세요. 데이터는 소프트 삭제됩니다." : "이 프로젝트를 목록에서 삭제합니다. 데이터는 소프트 삭제됩니다."}</p>
            {(securityDialog === "set-pin" || hasPassword) && <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoFocus aria-label="프로젝트 비밀번호 4자리" value={securityPin} onChange={(event) => setSecurityPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" onKeyDown={(event) => { if (event.key === "Enter") void submitSecurityDialog(); }} />}
            {securityError && <small role="alert">{securityError}</small>}
            <div className="security-dialog-actions"><button className="button secondary" type="button" disabled={securityLoading} onClick={() => setSecurityDialog(null)}>취소</button><button className={`button ${securityDialog === "delete" ? "danger" : "primary"}`} type="button" disabled={securityLoading || ((securityDialog === "set-pin" || hasPassword) && securityPin.length !== 4)} onClick={submitSecurityDialog}>{securityLoading ? "처리 중" : securityDialog === "set-pin" ? "설정하기" : "삭제하기"}</button></div>
          </section>
        </div>
      )}
      {newColumnDraft && (
        <div
          className="relation-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewColumnDraft(null);
          }}
        >
          <form
            className="relation-modal new-column-modal"
            role="dialog"
            aria-modal="true"
            aria-label="새 필드 만들기"
            onSubmit={(event) => {
              event.preventDefault();
              addColumn();
            }}
          >
            <header>
              <div>
                <span>＋</span>
                <strong>새 필드 만들기</strong>
              </div>
              <button
                type="button"
                aria-label="새 필드 창 닫기"
                onClick={() => setNewColumnDraft(null)}
              >
                ×
              </button>
            </header>
            <section>
              <label className="new-column-name">
                필드 이름
                <input
                  aria-label="새 필드 이름"
                  value={newColumnDraft.name}
                  autoFocus
                  onChange={(event) =>
                    setNewColumnDraft((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
            </section>
            <section>
              <small>필드 타입</small>
              <h2>어떤 값을 넣을까요?</h2>
              <div className="column-type-grid">
                {columnTypeOptions.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    className={
                      newColumnDraft.type === option.type ? "active" : ""
                    }
                    onClick={() =>
                      setNewColumnDraft((current) =>
                        current ? { ...current, type: option.type } : current,
                      )
                    }
                  >
                    <span>{option.icon}</span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </section>
            <footer>
              <button type="button" onClick={() => setNewColumnDraft(null)}>
                취소
              </button>
              <button
                className="confirm"
                disabled={
                  !newColumnDraft.name.trim() ||
                  activeSheet.columns.includes(newColumnDraft.name.trim())
                }
              >
                필드 만들기
              </button>
            </footer>
          </form>
        </div>
      )}
      {inspectingCalculatedField &&
        isConditionalSumField(inspectingCalculatedField) &&
        (() => {
          const field = inspectingCalculatedField;
          const resultSheet =
            sheets.find((sheet) => sheet.id === field.resultSheetId) ??
            emptySheet;
          const sourceSheet =
            sheets.find((sheet) => sheet.id === field.sourceSheetId) ??
            emptySheet;
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setInspectingCalculatedField(null);
              }}
            >
              <div
                className="relation-modal calculation-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${field.name} 계산 조건`}
              >
                <header>
                  <div>
                    <span className="fx-badge">∑</span>
                    <strong>{field.name}</strong>
                  </div>
                  <button
                    aria-label="계산 조건 닫기"
                    onClick={() => setInspectingCalculatedField(null)}
                  >
                    ×
                  </button>
                </header>
                <section>
                  <small>더할 값</small>
                  <h2>{sourceSheet.name} · {field.valueColumn}</h2>
                  <div className="calculation-detail-path">
                    <span>현재 행에서 찾을 데이터</span>
                    <strong>
                      {relationPathLabel(
                        resultSheet,
                        field.relationPath,
                        sheetRelations,
                        sheets,
                      )}
                    </strong>
                  </div>
                </section>
                <section>
                  <small>더할 데이터 조건 · {field.conditions.length}개</small>
                  <h2>아래 조건을 모두 만족할 때만 더함</h2>
                  <ol className="calculation-detail-conditions">
                    {field.conditions.map((condition) => {
                      const conditionPath =
                        condition.relationPath ?? field.relationPath;
                      const operand =
                        condition.operand.kind === "literal"
                          ? condition.operand.value
                          : `현재 행의 ${condition.operand.column}`;
                      const hasOperand =
                        condition.operator !== "isBlank" &&
                        condition.operator !== "isNotBlank";
                      return (
                        <li key={condition.id}>
                          <span>
                            {relationPathLabel(
                              resultSheet,
                              conditionPath,
                              sheetRelations,
                              sheets,
                            )} · {condition.column}
                          </span>
                          <strong>
                            {conditionalOperatorLabel(condition.operator)}
                          </strong>
                          {hasOperand && <em>{operand || "빈 값"}</em>}
                        </li>
                      );
                    })}
                  </ol>
                </section>
                <footer>
                  <button onClick={() => editCalculatedField(field)}>
                    조건 수정
                  </button>
                  <button
                    className="confirm"
                    onClick={() => setInspectingCalculatedField(null)}
                  >
                    확인
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      {inspectingCalculatedField &&
        !isConditionalSumField(inspectingCalculatedField) &&
        (() => {
          const field = inspectingCalculatedField;
          const resultSheet =
            sheets.find((sheet) => sheet.id === field.resultSheetId) ??
            emptySheet;
          const preview = resultSheet.rowIds.slice(0, 5).map((rowId, index) => ({
            rowId,
            label: resultSheet.rows[index]?.[0] ?? `${index + 1}번 데이터`,
            value: calculateFieldValue(
              field,
              sheetRelations,
              sheets,
              rowId,
              calculatedFields,
            ),
          }));
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setInspectingCalculatedField(null);
              }}
            >
              <div
                className="relation-modal calculation-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${field.name} 계산식`}
              >
                <header>
                  <div>
                    <span className="fx-badge">fx</span>
                    <strong>{field.name}</strong>
                  </div>
                  <button
                    aria-label="계산식 닫기"
                    onClick={() => setInspectingCalculatedField(null)}
                  >
                    ×
                  </button>
                </header>
                <section>
                  <small>계산식</small>
                  <h2>각 행에 아래 계산을 적용합니다</h2>
                  <div className="calculation-sentence calculation-detail-formula">
                    {field.formula.map((token, index) => {
                      if (token.kind === "operator")
                        return (
                          <span key={index}>
                            {token.operator === "*"
                              ? "×"
                              : token.operator === "/"
                                ? "÷"
                                : token.operator === "-"
                                  ? "−"
                                  : "+"}
                          </span>
                        );
                      const referencedSheet =
                        sheets.find((sheet) => sheet.id === token.sheetId) ??
                        emptySheet;
                      const derived = calculatedFields.some(
                        (candidate) =>
                          candidate.resultSheetId === token.sheetId &&
                          candidate.name === token.column,
                      );
                      return (
                        <b key={index}>
                          {relationPathLabel(
                            resultSheet,
                            token.relationPath ?? [],
                            sheetRelations,
                            sheets,
                          ) || referencedSheet.name}{" "}
                          · {token.column}
                          {derived && <em>계산 결과</em>}
                        </b>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <small>행별 결과</small>
                  <h2>현재 데이터로 계산한 값입니다</h2>
                  <div className="calculation-preview">
                    {preview.map((item) => (
                      <div key={item.rowId}>
                        <span>{item.label}</span>
                        <strong>{item.value || "빈 값"}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <footer>
                  <button onClick={() => editCalculatedField(field)}>
                    계산식 수정
                  </button>
                  <button
                    className="confirm"
                    onClick={() => setInspectingCalculatedField(null)}
                  >
                    확인
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      {conditionalSumDraft &&
        (() => {
          const sourceSheet = sheets.find(
            (sheet) => sheet.id === conditionalSumDraft.sourceSheetId,
          ) ?? emptySheet;
          const previewField: ConditionalSumField = {
            ...conditionalSumDraft,
            id: "conditional-sum-preview",
            kind: "conditionalSum",
          };
          const previewRelations = sheetRelations.filter((relation) =>
            calculatedFieldRelationIds(previewField).includes(relation.id),
          );
          const preview = activeSheet.rowIds.slice(0, 5).map((rowId, index) => ({
            rowId,
            label: activeSheet.rows[index]?.[0] ?? `${index + 1}번 데이터`,
            value: calculateConditionalSum(
              previewField,
              previewRelations,
              sheets,
              rowId,
            ),
          }));
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  closeCalculatedFieldEditor();
              }}
            >
              <div
                className="relation-modal calculation-modal conditional-sum-modal"
                role="dialog"
                aria-modal="true"
                aria-label="조건에 맞는 값 더하기"
              >
                <header>
                  <div>
                    <span className="fx-badge">∑</span>
                    <strong>
                      조건에 맞는 값 더하기
                      {editingCalculatedFieldId ? " 수정" : ""}
                    </strong>
                  </div>
                  <button
                    aria-label="조건에 맞는 값 더하기 닫기"
                    onClick={closeCalculatedFieldEditor}
                  >
                    ×
                  </button>
                </header>
                <section>
                  <small>1단계 · 행마다 찾을 데이터</small>
                  <h2>각 행에서 어떤 값을 더할까요?</h2>
                  <div className="conditional-sum-grid">
                    <label>
                      현재 행에서 찾을 데이터
                      <select
                        aria-label="현재 행에서 찾을 데이터"
                        value={conditionalSumDraft.sourceSheetId}
                        onChange={(event) =>
                          selectConditionalSumSource(event.target.value)
                        }
                      >
                        {aggregateSheetPaths.map(({ sheet, relationPath }) => (
                          <option key={sheet.id} value={sheet.id}>
                            {relationPathLabel(
                              activeSheet,
                              relationPath,
                              sheetRelations,
                              sheets,
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      더할 값
                      <select
                        aria-label="더할 값"
                        value={conditionalSumDraft.valueColumn}
                        onChange={(event) =>
                          setConditionalSumDraft((current) =>
                            current && {
                              ...current,
                              valueColumn: event.target.value,
                            },
                          )
                        }
                      >
                        {numericColumns(sourceSheet).map((column) => (
                          <option key={column}>{column}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="formula-help">
                    이 규칙은 {activeSheet.name}의 모든 행에 적용됩니다. 각
                    행마다 연결된 {sourceSheet.name} 데이터를 찾고 {" "}
                    {conditionalSumDraft.valueColumn} 값을 더합니다.
                  </p>
                </section>
                <section>
                  <small>2단계 · 더할 데이터 조건</small>
                  <h2>어떤 데이터만 더할까요?</h2>
                  <p className="formula-help">
                    현재 행이나 연결된 다른 데이터의 필드를 조건으로 고를 수
                    있습니다. 아래 조건을 모두 만족하는 데이터만 더합니다.
                  </p>
                  <div className="conditional-rule-list">
                    {conditionalSumDraft.conditions.map((condition, index) => {
                      const hasOperand =
                        condition.operator !== "isBlank" &&
                        condition.operator !== "isNotBlank";
                      const conditionSheetId =
                        condition.sheetId ?? conditionalSumDraft.sourceSheetId;
                      const conditionPath =
                        condition.relationPath ??
                        conditionalSumDraft.relationPath;
                      return (
                        <div className="conditional-rule" key={condition.id}>
                          <span>{index === 0 ? "IF" : "AND"}</span>
                          <select
                            aria-label={`${index + 1}번째 조건 필드`}
                            value={JSON.stringify([
                              conditionSheetId,
                              condition.column,
                              conditionPath,
                            ])}
                            onChange={(event) => {
                              const [sheetId, column, relationPath] = JSON.parse(
                                event.target.value,
                              ) as [string, string, string[]];
                              setConditionalSumDraft((current) =>
                                current && {
                                  ...current,
                                  conditions: current.conditions.map((item) =>
                                    item.id === condition.id
                                      ? {
                                          ...item,
                                          sheetId,
                                          relationPath,
                                          column,
                                        }
                                      : item,
                                  ),
                                },
                              );
                            }}
                          >
                            {conditionalSheetPaths.flatMap(
                              ({ sheet, relationPath }) =>
                                sheet.columns.map((column) => (
                                  <option
                                    key={`${sheet.id}:${column}`}
                                    value={JSON.stringify([
                                      sheet.id,
                                      column,
                                      relationPath,
                                    ])}
                                  >
                                    {relationPathLabel(
                                      activeSheet,
                                      relationPath,
                                      sheetRelations,
                                      sheets,
                                    )} · {column}
                                  </option>
                                )),
                            )}
                          </select>
                          <select
                            aria-label={`${index + 1}번째 비교 방식`}
                            value={condition.operator}
                            onChange={(event) =>
                              setConditionalSumDraft((current) =>
                                current && {
                                  ...current,
                                  conditions: current.conditions.map((item) =>
                                    item.id === condition.id
                                      ? {
                                          ...item,
                                          operator: event.target
                                            .value as ConditionalOperator,
                                        }
                                      : item,
                                  ),
                                },
                              )
                            }
                          >
                            <option value="eq">같음</option>
                            <option value="neq">다름</option>
                            <option value="gt">보다 큼</option>
                            <option value="gte">이상</option>
                            <option value="lt">보다 작음</option>
                            <option value="lte">이하</option>
                            <option value="isBlank">비어 있음</option>
                            <option value="isNotBlank">비어 있지 않음</option>
                          </select>
                          {hasOperand && (
                            <>
                              <select
                                aria-label={`${index + 1}번째 조건값 종류`}
                                value={condition.operand.kind}
                                onChange={(event) =>
                                  setConditionalSumDraft((current) =>
                                    current && {
                                      ...current,
                                      conditions: current.conditions.map(
                                        (item) =>
                                          item.id === condition.id
                                            ? {
                                                ...item,
                                                operand:
                                                  event.target.value ===
                                                  "currentRowField"
                                                    ? {
                                                        kind: "currentRowField",
                                                        column:
                                                          activeSheet.columns[0] ??
                                                          "",
                                                      }
                                                    : {
                                                        kind: "literal",
                                                        value: "",
                                                      },
                                              }
                                            : item,
                                      ),
                                    },
                                  )
                                }
                              >
                                <option value="literal">직접 입력</option>
                                <option value="currentRowField">
                                  현재 행 필드
                                </option>
                              </select>
                              {condition.operand.kind === "literal" ? (
                                <input
                                  aria-label={`${index + 1}번째 조건값`}
                                  placeholder="조건값"
                                  value={condition.operand.value}
                                  onChange={(event) =>
                                    setConditionalSumDraft((current) =>
                                      current && {
                                        ...current,
                                        conditions: current.conditions.map(
                                          (item) =>
                                            item.id === condition.id &&
                                            item.operand.kind === "literal"
                                              ? {
                                                  ...item,
                                                  operand: {
                                                    ...item.operand,
                                                    value: event.target.value,
                                                  },
                                                }
                                              : item,
                                        ),
                                      },
                                    )
                                  }
                                />
                              ) : (
                                <select
                                  aria-label={`${index + 1}번째 현재 행 필드`}
                                  value={condition.operand.column}
                                  onChange={(event) =>
                                    setConditionalSumDraft((current) =>
                                      current && {
                                        ...current,
                                        conditions: current.conditions.map(
                                          (item) =>
                                            item.id === condition.id &&
                                            item.operand.kind ===
                                              "currentRowField"
                                              ? {
                                                  ...item,
                                                  operand: {
                                                    ...item.operand,
                                                    column: event.target.value,
                                                  },
                                                }
                                              : item,
                                        ),
                                      },
                                    )
                                  }
                                >
                                  {activeSheet.columns.map((column) => (
                                    <option key={column}>{column}</option>
                                  ))}
                                </select>
                              )}
                            </>
                          )}
                          <button
                            aria-label={`${index + 1}번째 조건 삭제`}
                            disabled={conditionalSumDraft.conditions.length <= 1}
                            onClick={() =>
                              setConditionalSumDraft((current) =>
                                current && {
                                  ...current,
                                  conditions: current.conditions.filter(
                                    (item) => item.id !== condition.id,
                                  ),
                                },
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="add-condition-button"
                    onClick={addConditionalSumCondition}
                    disabled={conditionalSumDraft.conditions.length >= 127}
                  >
                    <Icons.plus /> AND 조건 추가
                  </button>
                </section>
                <section>
                  <small>3단계 · 행별 계산 결과</small>
                  <h2>규칙과 행별 결과를 확인하세요</h2>
                  <div className="business-rule-summary">
                    <strong>
                      각 {activeSheet.name} 행마다 {sourceSheet.name}의 {" "}
                      {conditionalSumDraft.valueColumn} 더하기
                    </strong>
                    <p>
                      현재 행을 기준으로 연결된 데이터를 찾고, {" "}
                      {conditionalSumDraft.conditions.length}개 조건을 모두 만족하는
                      데이터의 값을 더합니다.
                    </p>
                    <ul>
                      {conditionalSumDraft.conditions.map((condition) => {
                        const conditionPath =
                          condition.relationPath ??
                          conditionalSumDraft.relationPath;
                        const operand =
                          condition.operand.kind === "literal"
                            ? condition.operand.value || "빈 값"
                            : `현재 행의 ${condition.operand.column}`;
                        return (
                          <li key={condition.id}>
                            {relationPathLabel(
                              activeSheet,
                              conditionPath,
                              sheetRelations,
                              sheets,
                            )} · {condition.column}{" "}
                            {conditionalOperatorLabel(condition.operator)}{" "}
                            {condition.operator !== "isBlank" &&
                            condition.operator !== "isNotBlank"
                              ? operand
                              : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <label className="relation-target-sheet">
                    새 계산 컬럼 이름
                    <input
                      aria-label="새 계산 컬럼 이름"
                      value={conditionalSumDraft.name}
                      onChange={(event) =>
                        setConditionalSumDraft((current) =>
                          current && { ...current, name: event.target.value },
                        )
                      }
                    />
                  </label>
                  <strong className="calculation-preview-title">
                    행별 미리보기
                  </strong>
                  <div className="calculation-preview">
                    {preview.map((item) => (
                      <div key={item.rowId}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <footer>
                  <button onClick={closeCalculatedFieldEditor}>
                    취소
                  </button>
                  <button
                    className="confirm"
                    disabled={!conditionalSumDraft.name.trim()}
                    onClick={saveConditionalSum}
                  >
                    {editingCalculatedFieldId
                      ? "계산 컬럼 수정 저장"
                      : "계산 컬럼 만들기"}
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      {calculationDraft &&
        (() => {
          const formulaRelations = sheetRelations.filter((item) =>
            calculationDraft.relationIds.includes(item.id),
          );
          const formulaSheetPaths = calculableSheetPaths;
          const sampleField: CalculatedField = {
            id: "preview",
            name: calculationDraft.name,
            resultSheetId: activeSheet.id,
            relationIds: calculationDraft.relationIds,
            formula: calculationDraft.formula,
          };
          const labelColumn = activeSheet.columns[0] ?? "";
          const preview = activeSheet.rowIds
            .slice(0, 5)
            .map((rowId, index) => ({
              rowId,
              label:
                activeSheet.rows[index]?.[
                  activeSheet.columns.indexOf(labelColumn)
                ] ?? `${index + 1}번 데이터`,
              value: calculateFieldValue(
                sampleField,
                sheetRelations,
                sheets,
                rowId,
                [...calculatedFields, sampleField],
              ),
            }));
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  closeCalculatedFieldEditor();
              }}
            >
              <div
                className="relation-modal calculation-modal"
                role="dialog"
                aria-modal="true"
                aria-label="계산 필드 만들기"
              >
                <header>
                  <div>
                    <span className="fx-badge">fx</span>
                    <strong>
                      계산 필드 {editingCalculatedFieldId ? "수정" : "만들기"}
                    </strong>
                  </div>
                  <button
                    aria-label="계산 필드 닫기"
                    onClick={closeCalculatedFieldEditor}
                  >
                    ×
                  </button>
                </header>
                <section>
                  <small>1단계</small>
                  <h2>계산에 사용할 수 있는 시트</h2>
                  <div className="calculation-sheet-list">
                    {formulaSheetPaths.map(({ sheet, relationPath }) => (
                      <span key={sheet.id}>
                        <Icons.database />
                        {relationPathLabel(
                          activeSheet,
                          relationPath,
                          formulaRelations,
                          sheets,
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="formula-help">
                    관계를 여러 단계 따라가도 현재 행에서 하나의 행으로 확정되는
                    경로만 포함했습니다.
                  </p>
                </section>
                <section>
                  <small>2단계</small>
                  <h2>수식을 만들어주세요</h2>
                  <p className="formula-help">
                    필드를 고르고 연산자를 눌러 항을 계속 추가하세요. 키보드의 +
                    - * / 와 Backspace도 사용할 수 있어요.
                  </p>
                  <div
                    className="formula-builder"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      const operator =
                        event.key === "+" ||
                        event.key === "-" ||
                        event.key === "*" ||
                        event.key === "/"
                          ? (event.key as CalculationOperator)
                          : null;
                      if (operator) {
                        event.preventDefault();
                        appendFormulaOperator(operator);
                      }
                      if (
                        event.key === "Backspace" &&
                        calculationDraft.formula.length > 1
                      ) {
                        event.preventDefault();
                        removeLastFormulaTerm();
                      }
                    }}
                  >
                    <div className="formula-line">
                      {calculationDraft.formula.map((token, index) =>
                        token.kind === "field" ? (
                          <select
                            key={`${index}-field`}
                            aria-label={`${Math.floor(index / 2) + 1}번째 항`}
                            value={JSON.stringify([
                              token.sheetId,
                              token.column,
                              token.relationPath ?? [],
                            ])}
                            onChange={(event) =>
                              updateFormulaField(index, event.target.value)
                            }
                          >
                            {formulaSheetPaths.flatMap(
                              ({ sheet, relationPath }) =>
                                numericFieldNames(sheet).map((column) => (
                                  <option
                                    key={`${sheet.id}:${column}`}
                                    value={JSON.stringify([
                                      sheet.id,
                                      column,
                                      relationPath,
                                    ])}
                                  >
                                    {relationPathLabel(
                                      activeSheet,
                                      relationPath,
                                      formulaRelations,
                                      sheets,
                                    )}{" "}
                                    · {column}
                                    {calculatedFields.some(
                                      (field) =>
                                        field.resultSheetId === sheet.id &&
                                        field.name === column,
                                    )
                                      ? " · 계산 결과"
                                      : ""}
                                  </option>
                                )),
                            )}
                          </select>
                        ) : (
                          <select
                            key={`${index}-operator`}
                            className="formula-operator"
                            aria-label={`${Math.ceil(index / 2)}번째 연산자`}
                            value={token.operator}
                            onChange={(event) =>
                              updateFormulaOperator(
                                index,
                                event.target.value as CalculationOperator,
                              )
                            }
                          >
                            <option value="+">+</option>
                            <option value="-">−</option>
                            <option value="*">×</option>
                            <option value="/">÷</option>
                          </select>
                        ),
                      )}
                    </div>
                    <div className="formula-keypad" aria-label="사칙연산 버튼">
                      {(["+", "-", "*", "/"] as CalculationOperator[]).map(
                        (operator) => (
                          <button
                            key={operator}
                            aria-label={`${operator} 항 추가`}
                            onClick={() => appendFormulaOperator(operator)}
                          >
                            {operator === "*"
                              ? "×"
                              : operator === "/"
                                ? "÷"
                                : operator === "-"
                                  ? "−"
                                  : "+"}
                          </button>
                        ),
                      )}
                      <button
                        className="remove-term"
                        disabled={calculationDraft.formula.length <= 1}
                        onClick={removeLastFormulaTerm}
                      >
                        마지막 항 삭제
                      </button>
                    </div>
                  </div>
                </section>
                <section>
                  <small>3단계</small>
                  <h2>결과 필드의 이름을 정해주세요</h2>
                  <label className="relation-target-sheet">
                    필드 이름
                    <input
                      aria-label="계산 필드 이름"
                      value={calculationDraft.name}
                      onChange={(event) =>
                        setCalculationDraft(
                          (current) =>
                            current && { ...current, name: event.target.value },
                        )
                      }
                    />
                  </label>
                  <div className="calculation-sentence">
                    {calculationDraft.formula.map((token, index) =>
                      token.kind === "field" ? (
                        <b key={index}>
                          {
                            sheets.find((sheet) => sheet.id === token.sheetId)
                              ?.name
                          }{" "}
                          · {token.column}
                        </b>
                      ) : (
                        <span key={index}>
                          {token.operator === "*"
                            ? "×"
                            : token.operator === "/"
                              ? "÷"
                              : token.operator === "-"
                                ? "−"
                                : "+"}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="calculation-preview">
                    {preview.map((item) => (
                      <div key={item.rowId}>
                        <span>{item.label}</span>
                        <strong>{item.value || "빈 값"}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <footer>
                  <button onClick={closeCalculatedFieldEditor}>
                    취소
                  </button>
                  <button
                    className="confirm"
                    disabled={
                      !calculationDraft.name.trim() ||
                      calculationDraft.formula.length < 3
                    }
                    onClick={saveCalculatedField}
                  >
                    {editingCalculatedFieldId
                      ? "계산 필드 수정 저장"
                      : "계산 필드 만들기"}
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      {relationDraft &&
        (() => {
          const source = sheets.find(
            (sheet) => sheet.id === relationDraft.sourceSheetId,
          )!;
          const target = sheets.find(
            (sheet) => sheet.id === relationDraft.targetSheetId,
          )!;
          const sourceIndex = source.columns.indexOf(
            relationDraft.sourceColumn,
          );
          const targetIndex = target.columns.indexOf(
            relationDraft.targetColumn,
          );
          const matches = [
            ...new Set(
              source.rows
                .map((row) => row[sourceIndex])
                .filter(
                  (value) =>
                    value &&
                    target.rows.some((row) => row[targetIndex] === value),
                ),
            ),
          ];
          return (
            <div
              className="relation-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setRelationDraft(null);
              }}
            >
              <div
                className="relation-modal"
                role="dialog"
                aria-modal="true"
                aria-label="시트 관계 만들기"
              >
                <header>
                  <div>
                    <span>
                      <Icons.database />
                      {source.name}
                    </span>
                    <b>↔</b>
                    <span>
                      <Icons.database />
                      {target.name}
                    </span>
                  </div>
                  <button
                    aria-label="관계 설정 닫기"
                    onClick={() => setRelationDraft(null)}
                  >
                    ×
                  </button>
                </header>
                <section>
                  <small>1단계</small>
                  <h2>어떤 시트와 연결할까요?</h2>
                  <label className="relation-target-sheet">
                    연결할 시트
                    <select
                      aria-label="연결할 시트"
                      value={relationDraft.targetSheetId}
                      onChange={(event) => {
                        const nextTarget = sheets.find(
                          (sheet) => sheet.id === event.target.value,
                        );
                        if (!nextTarget) return;
                        const candidates = detectJoinCandidates(
                          source,
                          nextTarget,
                        );
                        setRelationDraft(
                          (current) =>
                            current && {
                              ...current,
                              targetSheetId: nextTarget.id,
                              sourceColumn:
                                source.columns[
                                  candidates[0]?.leftColumn ?? 0
                                ] ?? "",
                              targetColumn:
                                nextTarget.columns[
                                  candidates[0]?.rightColumn ?? 0
                                ] ?? "",
                              relationType: "",
                            },
                        );
                      }}
                    >
                      {sheets
                        .filter((sheet) => sheet.id !== source.id)
                        .map((sheet) => (
                          <option key={sheet.id} value={sheet.id}>
                            {sheet.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </section>
                <section>
                  <small>2단계</small>
                  <h2>두 시트는 어떤 관계인가요?</h2>
                  <div className="relation-choice-grid">
                    {(
                      [
                        ["1:1", "하나와 하나", "각 데이터가 하나씩 연결돼요"],
                        [
                          "1:N",
                          "하나와 여러 개",
                          `${source.name} 하나에 ${target.name} 여러 개`,
                        ],
                        [
                          "N:1",
                          "여러 개와 하나",
                          `${source.name} 여러 개가 ${target.name} 하나에 연결`,
                        ],
                        [
                          "N:N",
                          "여러 개와 여러 개",
                          "양쪽 모두 여러 데이터와 연결돼요",
                        ],
                      ] as [RelationType, string, string][]
                    ).map(([type, title, description]) => (
                      <button
                        key={type}
                        className={
                          relationDraft.relationType === type ? "active" : ""
                        }
                        onClick={() =>
                          setRelationDraft(
                            (current) =>
                              current && { ...current, relationType: type },
                          )
                        }
                      >
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </button>
                    ))}
                  </div>
                </section>
                {relationDraft.relationType && (
                  <section>
                    <small>3단계</small>
                    <h2>어떤 값이 같을 때 연결할까요?</h2>
                    <div className="relation-column-picks">
                      <label>
                        {source.name} 필드
                        <select
                          value={relationDraft.sourceColumn}
                          onChange={(event) =>
                            setRelationDraft(
                              (current) =>
                                current && {
                                  ...current,
                                  sourceColumn: event.target.value,
                                },
                            )
                          }
                        >
                          {source.columns.map((column) => (
                            <option key={column}>{column}</option>
                          ))}
                        </select>
                      </label>
                      <span>값이 같으면</span>
                      <label>
                        {target.name} 필드
                        <select
                          value={relationDraft.targetColumn}
                          onChange={(event) =>
                            setRelationDraft(
                              (current) =>
                                current && {
                                  ...current,
                                  targetColumn: event.target.value,
                                },
                            )
                          }
                        >
                          {target.columns.map((column) => (
                            <option key={column}>{column}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="relation-match-preview">
                      <Icons.sparkles />
                      <div>
                        <strong>같은 값 {matches.length}개를 찾았어요</strong>
                        <small>
                          {matches.length
                            ? matches.slice(0, 3).join(", ")
                            : "필드를 바꾸면 연결 가능한 값을 다시 찾아요."}
                        </small>
                      </div>
                    </div>
                  </section>
                )}
                <footer>
                  <button onClick={() => setRelationDraft(null)}>취소</button>
                  <button
                    className="confirm"
                    disabled={
                      !relationDraft.relationType || !relationDraft.targetColumn
                    }
                    onClick={saveSheetRelation}
                  >
                    관계 만들기
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
