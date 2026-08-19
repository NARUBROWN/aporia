import "server-only";

import { prisma } from "@/lib/prisma";
import { deserializeCalculatedField } from "@/lib/normalized-definitions";

/** 플레이그라운드 최초 렌더링에 필요한 작은 정규화 메타데이터만 조회한다. */
export async function loadProjectSheetMetadata(projectId: string) {
  const [sheets, latestBatch, relations, calculatedFields] = await Promise.all([
    prisma.projectSheet.findMany({
      where: { projectId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        comment: true,
        displayOrder: true,
        origin: true,
        rowCount: true,
        dataRevision: true,
        columns: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            name: true,
            dataType: true,
            displayOrder: true,
            color: true,
            comment: true,
            nullable: true,
            primaryKey: true,
          },
        },
      },
    }),
    prisma.seedBatch.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, importedRows: true, failedRows: true },
    }),
    prisma.sheetRelation.findMany({
      where: { sourceSheet: { projectId } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sourceSheetId: true,
        targetSheetId: true,
        relationType: true,
        relationOrigin: true,
        sourceColumn: { select: { name: true } },
        targetColumn: { select: { name: true } },
      },
    }),
    prisma.calculatedFieldRecord.findMany({
      where: { sheet: { projectId } },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        fieldType: true,
        color: true,
        sheetId: true,
        rules: {
          orderBy: { stepOrder: "asc" },
          select: { stepOrder: true, operation: true, arguments: true },
        },
        conditions: {
          orderBy: { conditionOrder: "asc" },
          select: {
            conditionOrder: true,
            operator: true,
            operandType: true,
            operandValue: true,
            sourceColumn: { select: { name: true, sheetId: true } },
          },
        },
      },
    }),
  ]);

  return {
    seedBatch: latestBatch
      ? {
          id: latestBatch.id,
          status: latestBatch.status,
          importedRows: Number(latestBatch.importedRows),
          failedRows: Number(latestBatch.failedRows),
        }
      : null,
    sheets: sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      color: sheet.color,
      comment: sheet.comment,
      displayOrder: sheet.displayOrder,
      origin: sheet.origin,
      rowCount: Number(sheet.rowCount),
      dataRevision: Number(sheet.dataRevision),
      columns: sheet.columns.map((column) => ({
        id: column.id,
        name: column.name,
        dataType: column.dataType,
        displayOrder: column.displayOrder,
        color: column.color,
        comment: column.comment,
        nullable: column.nullable,
        primaryKey: column.primaryKey,
      })),
    })),
    relations: relations.map((relation) => ({
      id: relation.id,
      sourceSheetId: relation.sourceSheetId,
      sourceColumn: relation.sourceColumn.name,
      targetSheetId: relation.targetSheetId,
      targetColumn: relation.targetColumn.name,
      relationType: relation.relationType,
      relationOrigin: relation.relationOrigin,
    })),
    calculatedFields: calculatedFields.map(deserializeCalculatedField),
  };
}
