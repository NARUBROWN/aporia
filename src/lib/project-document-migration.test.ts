import assert from "node:assert/strict";
import test from "node:test";

import {
  currentProjectSchemaVersion,
  migrateProjectDocument,
} from "./project-document-migration";

test("items 기반 구버전 스냅샷을 현재 페이지 문서로 변환한다", () => {
  const migrated = migrateProjectDocument({
    schemaVersion: 4,
    items: [{ id: "legacy-component", kind: "text", label: "이전 제목" }],
  });

  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, currentProjectSchemaVersion);
  assert.deepEqual(migrated.pages, [
    {
      id: "page-1",
      name: "첫 화면",
      path: "/",
      items: [{ id: "legacy-component", kind: "text", label: "이전 제목" }],
    },
  ]);
  assert.equal(migrated.activePageId, "page-1");
  assert.deepEqual(migrated.filterBindings, {});
  assert.deepEqual(migrated.calculatedFields, []);
  assert.equal("items" in migrated, false);
});

test("중간 버전 스냅샷의 데이터와 계산 규칙을 보존하며 누락 필드를 채운다", () => {
  const migrated = migrateProjectDocument({
    schemaVersion: 8,
    pages: [{ id: "custom", items: [{ id: "table" }] }],
    activePageId: "missing-page",
    sheets: [{ id: "sheet-a" }, { id: "sheet-b" }],
    displayBindings: { table: { sheetId: "sheet-a" } },
    sheetRelations: [{ id: "relation-a" }],
    calculatedFields: [{ id: "calculation-a" }],
  });

  assert.ok(migrated);
  assert.equal(migrated.activePageId, "custom");
  assert.deepEqual(migrated.sheetRelations, [{ id: "relation-a" }]);
  assert.deepEqual(migrated.calculatedFields, [{ id: "calculation-a" }]);
  assert.deepEqual(migrated.sheetFolders, []);
  assert.deepEqual(migrated.dataBinding, {
    primarySheet: "sheet-a",
    joinedSheet: "sheet-b",
    linkSourceId: "sheet-a",
    connectionPath: [],
    selectedCandidateId: "",
    relationType: "N:1",
  });
});

test("객체가 아닌 손상된 스냅샷은 거부한다", () => {
  assert.equal(migrateProjectDocument(null), null);
  assert.equal(migrateProjectDocument([]), null);
});
