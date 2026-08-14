import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSheetRowIndexes,
  findShortestRelationPath,
  type FilterRelation,
  type FilterSheet,
} from "./sheet-filtering";

const sheets: FilterSheet[] = [
  {
    id: "site",
    columns: ["id", "name"],
    rowIds: ["site-1", "site-2"],
    rows: [["1", "울산"], ["2", "대전"]],
  },
  {
    id: "material",
    columns: ["id", "siteId"],
    rowIds: ["material-1", "material-2", "material-3"],
    rows: [["10", "1"], ["20", "2"], ["30", "1"]],
  },
  {
    id: "fact",
    columns: ["materialId", "amount"],
    rowIds: ["fact-1", "fact-2", "fact-3"],
    rows: [["10", "100"], ["20", "200"], ["30", "300"]],
  },
];

const relations: FilterRelation[] = [
  {
    id: "site-material",
    sourceSheetId: "site",
    sourceColumn: "id",
    targetSheetId: "material",
    targetColumn: "siteId",
  },
  {
    id: "material-fact",
    sourceSheetId: "material",
    sourceColumn: "id",
    targetSheetId: "fact",
    targetColumn: "materialId",
  },
];

test("가장 짧은 관계 경로를 찾는다", () => {
  assert.deepEqual(findShortestRelationPath("site", "fact", relations), [
    "site-material",
    "material-fact",
  ]);
  assert.equal(findShortestRelationPath("site", "missing", relations), null);
});

test("선택값을 관계 경로를 따라 대상 행으로 전파한다", () => {
  assert.deepEqual(
    filterSheetRowIndexes(
      sheets[2],
      [{
        sourceSheetId: "site",
        sourceColumn: "name",
        value: "울산",
        target: {
          componentId: "fact-table",
          sheetId: "fact",
          relationPath: ["site-material", "material-fact"],
        },
      }],
      relations,
      sheets,
    ),
    [0, 2],
  );
});

test("여러 필터는 AND로 적용하고 빈 선택은 무시한다", () => {
  assert.deepEqual(
    filterSheetRowIndexes(
      sheets[1],
      [
        {
          sourceSheetId: "material",
          sourceColumn: "siteId",
          value: "1",
          target: { componentId: "table", sheetId: "material", relationPath: [] },
        },
        {
          sourceSheetId: "material",
          sourceColumn: "id",
          value: "30",
          target: { componentId: "table", sheetId: "material", relationPath: [] },
        },
        {
          sourceSheetId: "material",
          sourceColumn: "id",
          value: "",
          target: { componentId: "table", sheetId: "material", relationPath: [] },
        },
      ],
      relations,
      sheets,
    ),
    [2],
  );
});
