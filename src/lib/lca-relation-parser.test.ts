import assert from "node:assert/strict";
import test from "node:test";
import { parseBulkRelations } from "./lca-relation-parser";

test("bulk 제약 SQL에서 검증된 N:1 관계를 읽는다", () => {
  const relations = parseBulkRelations(`
    ALTER TABLE [dbo].[FACT] WITH CHECK ADD CONSTRAINT [FK_FACT_DIM]
      FOREIGN KEY ([DIM_ID]) REFERENCES [dbo].[DIM] ([ID]);
  `);
  assert.deepEqual(relations, [{
    name: "FK_FACT_DIM", sourceTable: "FACT", sourceColumn: "DIM_ID",
    targetTable: "DIM", targetColumn: "ID", relationType: "N:1",
    checked: true, onDelete: "NO ACTION",
  }]);
});

test("단일 UNIQUE FK와 NOCHECK 삭제 정책을 보존한다", () => {
  const relations = parseBulkRelations(`
    ALTER TABLE [dbo].[LINK] ADD CONSTRAINT [UQ_LINK_TARGET] UNIQUE NONCLUSTERED ([TARGET_ID]);
    ALTER TABLE [dbo].[LINK] WITH NOCHECK ADD CONSTRAINT [FK_LINK_TARGET]
      FOREIGN KEY ([TARGET_ID]) REFERENCES [dbo].[TARGET] ([ID]) ON DELETE SET NULL;
  `);
  assert.equal(relations[0].relationType, "1:1");
  assert.equal(relations[0].checked, false);
  assert.equal(relations[0].onDelete, "SET NULL");
});
