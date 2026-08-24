import assert from "node:assert/strict";
import test from "node:test";

import {
  expandRelatedSheetIds,
  needsInitialNormalizedRows,
  virtualRowWindow,
} from "./normalized-sheet-loading";

test("화면 주변 행만 렌더링하고 나머지 높이는 여백으로 보존한다", () => {
  assert.deepEqual(
    virtualRowWindow({
      rowCount: 1_000,
      scrollTop: 2_900,
      viewportHeight: 290,
      overscan: 5,
    }),
    {
      start: 95,
      end: 115,
      paddingTop: 2_755,
      paddingBottom: 25_665,
    },
  );
});

test("뷰포트 측정 전에는 최초 100행까지만 렌더링한다", () => {
  assert.deepEqual(
    virtualRowWindow({
      rowCount: 15_755_890,
      scrollTop: 0,
      viewportHeight: 0,
    }),
    {
      start: 0,
      end: 100,
      paddingTop: 0,
      paddingBottom: 456_917_910,
    },
  );
});

test("행 삭제나 시트 전환으로 스크롤 위치가 범위를 벗어나도 마지막 행으로 제한한다", () => {
  assert.deepEqual(
    virtualRowWindow({
      rowCount: 10,
      scrollTop: 29_000,
      viewportHeight: 290,
      overscan: 2,
    }),
    {
      start: 7,
      end: 10,
      paddingTop: 203,
      paddingBottom: 0,
    },
  );
});

test("정규화 시트는 첫 페이지가 비어 있을 때만 자동 조회한다", () => {
  assert.equal(
    needsInitialNormalizedRows({
      normalized: true,
      rowCount: 15_755_890,
      loadedRowCount: 0,
    }),
    true,
  );
  assert.equal(
    needsInitialNormalizedRows({
      normalized: true,
      rowCount: 15_755_890,
      loadedRowCount: 100,
    }),
    false,
  );
});

test("빈 시트와 일반 시트는 자동 조회하지 않는다", () => {
  assert.equal(
    needsInitialNormalizedRows({
      normalized: true,
      rowCount: 0,
      loadedRowCount: 0,
    }),
    false,
  );
  assert.equal(
    needsInitialNormalizedRows({
      normalized: false,
      rowCount: 10,
      loadedRowCount: 0,
    }),
    false,
  );
});

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
