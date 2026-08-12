import assert from "node:assert/strict";
import test from "node:test";

import { parseDdl, parseSqlServerValues } from "../../scripts/seed-lca-normalized";

test("SQL Server DDL에서 컬럼과 기본 키를 읽는다", () => {
  const table = parseDdl(`CREATE TABLE [dbo].[TEST] (
    [ID] bigint IDENTITY(1,1) NOT NULL,
    [NAME] nvarchar(64) NULL,
    [AMOUNT] decimal(18,4) NOT NULL,
    CONSTRAINT [PK_TEST] PRIMARY KEY ([ID])
  );`, "001_dbo.TEST.ddl.sql");
  assert.equal(table.name, "TEST");
  assert.deepEqual(table.columns.map((column) => [column.name, column.postgresType, column.primaryKey]), [
    ["ID", "BIGINT", true],
    ["NAME", "TEXT", false],
    ["AMOUNT", "DECIMAL(18,4)", false],
  ]);
});

test("SQL Server VALUES의 유니코드, 따옴표, NULL을 읽는다", () => {
  assert.deepEqual(parseSqlServerValues("(N'원정''님', NULL, 12.5, N'A,B'),"), ["원정'님", null, "12.5", "A,B"]);
});
