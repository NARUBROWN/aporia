import type { Prisma } from "@/generated/prisma/client";
import { deserializeCalculatedField, withoutNormalizedDefinitions } from "@/lib/normalized-definitions";
import { quoteRegisteredIdentifier } from "@/lib/postgres";
import { normalizeStoredColumnType } from "@/lib/sheet-value-validation";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function values(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function replaceStrings(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, replacements));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStrings(item, replacements)]));
  return value;
}

function calculationParts(field: JsonRecord) {
  const rules: Array<{ id: string; stepOrder: number; operation: string; arguments: Prisma.InputJsonValue }> = [];
  const conditions: Array<{ id: string; conditionOrder: number; sourceSheetOriginalId: string | null; sourceColumn: string | null; operator: string; operandType: string; operandValue: string | null }> = [];
  let stepOrder = 0;
  const addRule = (operation: string, argumentsValue: unknown) => rules.push({
    id: crypto.randomUUID(), stepOrder: stepOrder++, operation, arguments: argumentsValue as Prisma.InputJsonValue,
  });
  const kind = text(field.kind, "arithmetic");
  if (kind === "conditionalSum") {
    addRule("conditional_sum", {
      sourceSheetId: field.sourceSheetId,
      ...(Array.isArray(field.relationPath) ? { relationPath: field.relationPath } : {}),
      valueColumn: field.valueColumn,
    });
    records(field.conditions).forEach((condition, conditionOrder) => {
      const operand = record(condition.operand);
      conditions.push({
        id: crypto.randomUUID(), conditionOrder,
        sourceSheetOriginalId: text(condition.sheetId, text(field.sourceSheetId)) || null,
        sourceColumn: text(condition.column) || null,
        operator: text(condition.operator, "eq"), operandType: text(operand.kind, "literal"),
        operandValue: text(operand.value, text(operand.column)) || null,
      });
      addRule(`condition_meta:${conditionOrder}`, {
        id: condition.id,
        sheetId: condition.sheetId,
        ...(Array.isArray(condition.relationPath) ? { relationPath: condition.relationPath } : {}),
      });
    });
  } else if (kind === "transform") {
    addRule("transform_meta", { sourceColumn: field.sourceColumn, condition: field.condition, fallback: field.fallback, outputType: field.outputType });
    records(field.steps).forEach((step) => {
      const { type, ...argumentsValue } = step;
      addRule(`transform_step:${text(type, "unknown")}`, argumentsValue);
    });
  } else {
    const conditional = record(field.condition);
    addRule("arithmetic_meta", { relationIds: values(field.relationIds), conditionColumn: conditional.column });
    records(field.formula).forEach((token) => {
      const { kind: tokenKind, ...argumentsValue } = token;
      addRule(`formula:${text(tokenKind, "unknown")}`, argumentsValue);
    });
    records(conditional.cases).forEach((item, conditionOrder) => {
      conditions.push({
        id: crypto.randomUUID(), conditionOrder, sourceSheetOriginalId: text(field.resultSheetId) || null,
        sourceColumn: text(conditional.column) || null, operator: "eq",
        operandType: text(item.id, crypto.randomUUID()), operandValue: text(item.value) || null,
      });
      records(item.formula).forEach((token) => {
        const { kind: tokenKind, ...argumentsValue } = token;
        addRule(`case:${conditionOrder}:${text(tokenKind, "unknown")}`, argumentsValue);
      });
    });
  }
  return { rules, conditions };
}

export async function normalizeSnapshotDocument(
  transaction: Prisma.TransactionClient,
  snapshotId: string,
  document: JsonRecord,
) {
  await transaction.snapshotSheet.deleteMany({ where: { snapshotId } });
  await transaction.snapshotRelation.deleteMany({ where: { snapshotId } });
  await transaction.snapshotCalculatedField.deleteMany({ where: { snapshotId } });
  for (const [sheetOrder, sheet] of records(document.sheets).entries()) {
    const columns = values(sheet.columns).map((value) => text(value));
    const types = values(sheet.columnTypes);
    const rows = values(sheet.rows);
    const rowIds = values(sheet.rowIds);
    const colors = record(sheet.columnColors);
    const comments = record(sheet.columnComments);
    const snapshotSheetId = crypto.randomUUID();
    const columnIds = columns.map(() => crypto.randomUUID());
    await transaction.snapshotSheet.create({
      data: {
        id: snapshotSheetId, snapshotId, originalSheetId: text(sheet.id), name: text(sheet.name),
        color: text(sheet.color) || null, comment: text(sheet.comment) || null, displayOrder: sheetOrder,
        columns: { create: columns.map((name, displayOrder) => ({
          id: columnIds[displayOrder], name, dataType: text(types[displayOrder], "text"), displayOrder,
          color: text(colors[name]) || null, comment: text(comments[name]) || null,
        })) },
      },
    });
    for (let rowOrder = 0; rowOrder < rows.length; rowOrder++) {
      const rowId = crypto.randomUUID();
      const row = values(rows[rowOrder]);
      await transaction.snapshotRow.create({
        data: {
          id: rowId, snapshotSheetId, originalRowId: text(rowIds[rowOrder], String(rowOrder + 1)), rowOrder,
          cells: { create: columnIds.map((columnId, index) => ({
            columnId, value: row[index] === null || row[index] === undefined ? null : String(row[index]),
          })) },
        },
      });
    }
  }
  for (const [displayOrder, relation] of records(document.sheetRelations).entries()) {
    const links = records(relation.links);
    await transaction.snapshotRelation.create({ data: {
      id: crypto.randomUUID(), snapshotId, originalRelationId: text(relation.id, crypto.randomUUID()),
      sourceSheetOriginalId: text(relation.sourceSheetId), sourceColumn: text(relation.sourceColumn),
      targetSheetOriginalId: text(relation.targetSheetId), targetColumn: text(relation.targetColumn),
      relationType: text(relation.relationType), relationOrigin: text(relation.relationOrigin, "manual"),
      updateOption: text(relation.updateOption) || null,
      displayOrder,
      links: { create: links.map((link, linkOrder) => ({
        id: crypto.randomUUID(), sourceRowId: text(link.sourceRowId), targetRowId: text(link.targetRowId), linkOrder,
      })) },
    } });
  }
  for (const [displayOrder, field] of records(document.calculatedFields).entries()) {
    const parts = calculationParts(field);
    await transaction.snapshotCalculatedField.create({ data: {
      id: crypto.randomUUID(), snapshotId, originalFieldId: text(field.id, crypto.randomUUID()),
      resultSheetOriginalId: text(field.resultSheetId), name: text(field.name),
      fieldType: text(field.kind, "arithmetic"), color: text(field.color) || null, displayOrder,
      rules: { create: parts.rules }, conditions: { create: parts.conditions },
    } });
  }
  return withoutNormalizedDefinitions(document);
}

export async function hydrateNormalizedSnapshot(
  transaction: Prisma.TransactionClient,
  snapshotId: string,
  document: JsonRecord,
) {
  const [sheets, relations, fields] = await Promise.all([
    transaction.snapshotSheet.findMany({ where: { snapshotId }, orderBy: { displayOrder: "asc" }, include: {
      columns: { orderBy: { displayOrder: "asc" } }, rows: { orderBy: { rowOrder: "asc" }, include: { cells: true } },
    } }),
    transaction.snapshotRelation.findMany({ where: { snapshotId }, orderBy: { displayOrder: "asc" }, include: { links: { orderBy: { linkOrder: "asc" } } } }),
    transaction.snapshotCalculatedField.findMany({ where: { snapshotId }, orderBy: { displayOrder: "asc" }, include: {
      rules: { orderBy: { stepOrder: "asc" } }, conditions: { orderBy: { conditionOrder: "asc" } },
    } }),
  ]);
  if (!sheets.length && !relations.length && !fields.length) return document;
  return {
    ...document,
    sheets: sheets.map((sheet) => {
      const cellMaps = sheet.rows.map((row) => new Map(row.cells.map((cell) => [cell.columnId, cell.value ?? ""])));
      const columnColors = Object.fromEntries(sheet.columns.filter((column) => column.color).map((column) => [column.name, column.color]));
      const columnComments = Object.fromEntries(sheet.columns.filter((column) => column.comment).map((column) => [column.name, column.comment]));
      return {
        id: sheet.originalSheetId, name: sheet.name,
        ...(sheet.color ? { color: sheet.color } : {}), ...(sheet.comment ? { comment: sheet.comment } : {}),
        columns: sheet.columns.map((column) => column.name), columnTypes: sheet.columns.map((column) => column.dataType),
        ...(Object.keys(columnColors).length ? { columnColors } : {}),
        ...(Object.keys(columnComments).length ? { columnComments } : {}),
        rowIds: sheet.rows.map((row) => row.originalRowId),
        rows: cellMaps.map((cells) => sheet.columns.map((column) => cells.get(column.id) ?? "")),
      };
    }),
    sheetRelations: relations.map((relation) => ({
      id: relation.originalRelationId, sourceSheetId: relation.sourceSheetOriginalId, sourceColumn: relation.sourceColumn,
      targetSheetId: relation.targetSheetOriginalId, targetColumn: relation.targetColumn,
      relationType: relation.relationType, relationOrigin: relation.relationOrigin,
      ...(relation.updateOption ? { updateOption: relation.updateOption } : {}),
      ...(relation.links.length ? { links: relation.links.map((link) => ({ sourceRowId: link.sourceRowId, targetRowId: link.targetRowId })) } : {}),
    })),
    calculatedFields: fields.map((field) => deserializeCalculatedField({
      id: field.originalFieldId, name: field.name, fieldType: field.fieldType, color: field.color,
      sheetId: field.resultSheetOriginalId, rules: field.rules,
      conditions: field.conditions.map((condition) => ({
        ...condition,
        sourceColumn: condition.sourceColumn ? { name: condition.sourceColumn, sheetId: condition.sourceSheetOriginalId ?? undefined } : null,
      })),
    })),
  };
}

/** 현재 프로젝트의 정규화 상태를 스냅샷 정규화 테이블로 복제한다. 대용량 seed 원본 행은 별도 원본 테이블에 유지한다. */
export async function snapshotNormalizedProject(
  transaction: Prisma.TransactionClient,
  snapshotId: string,
  projectId: string,
  document: JsonRecord,
) {
  const [sheets, relations, fields] = await Promise.all([
    transaction.projectSheet.findMany({
      where: { projectId, origin: { not: "seed" } },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      include: { columns: { orderBy: { displayOrder: "asc" } } },
    }),
    transaction.sheetRelation.findMany({
      where: { sourceSheet: { projectId } },
      orderBy: { createdAt: "asc" },
      include: { sourceColumn: true, targetColumn: true },
    }),
    transaction.calculatedFieldRecord.findMany({
      where: { sheet: { projectId } },
      orderBy: { displayOrder: "asc" },
      include: {
        rules: { orderBy: { stepOrder: "asc" } },
        conditions: { orderBy: { conditionOrder: "asc" }, include: { sourceColumn: true } },
      },
    }),
  ]);
  const serializedSheets: JsonRecord[] = [];
  for (const sheet of sheets) {
    const columnNames = sheet.columns.map((column) => quoteRegisteredIdentifier(column.physicalColumnName));
    const rows = await transaction.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT _row_id::text, ${columnNames.join(", ")} FROM project_data.${quoteRegisteredIdentifier(sheet.physicalTableName)} ORDER BY _row_order ASC`,
    );
    serializedSheets.push({
      id: sheet.id,
      name: sheet.name,
      ...(sheet.color ? { color: sheet.color } : {}),
      ...(sheet.comment ? { comment: sheet.comment } : {}),
      columns: sheet.columns.map((column) => column.name),
      columnTypes: sheet.columns.map((column) => column.dataType),
      columnColors: Object.fromEntries(sheet.columns.filter((column) => column.color).map((column) => [column.name, column.color])),
      columnComments: Object.fromEntries(sheet.columns.filter((column) => column.comment).map((column) => [column.name, column.comment])),
      rowIds: rows.map((row) => String(row._row_id)),
      rows: rows.map((row) => sheet.columns.map((column) => {
        const value = row[column.physicalColumnName];
        if (value === null || value === undefined) return "";
        if (normalizeStoredColumnType(column.dataType) === "boolean") return value === true || value === "true" ? "예" : "아니오";
        if (value instanceof Date) return value.toISOString();
        return String(value);
      })),
    });
  }
  return normalizeSnapshotDocument(transaction, snapshotId, {
    ...document,
    sheets: serializedSheets,
    sheetRelations: relations.map((relation) => ({
      id: relation.id,
      sourceSheetId: relation.sourceSheetId,
      sourceColumn: relation.sourceColumn.name,
      targetSheetId: relation.targetSheetId,
      targetColumn: relation.targetColumn.name,
      relationType: relation.relationType,
      relationOrigin: relation.relationOrigin,
    })),
    calculatedFields: fields.map((field) => deserializeCalculatedField({
      id: field.id,
      name: field.name,
      fieldType: field.fieldType,
      color: field.color,
      sheetId: field.sheetId,
      rules: field.rules,
      conditions: field.conditions.map((condition) => ({
        ...condition,
        sourceColumn: condition.sourceColumn ? { name: condition.sourceColumn.name, sheetId: condition.sourceColumn.sheetId } : null,
      })),
    })),
  });
}

/** 레거시 스냅샷 식별자를 현재 프로젝트 UUID에 맞추고 seed 원본 행의 덮어쓰기를 막는다. */
export async function alignSnapshotDocumentToProject(
  transaction: Prisma.TransactionClient,
  projectId: string,
  document: JsonRecord,
) {
  const currentSheets = await transaction.projectSheet.findMany({
    where: { projectId },
    select: { id: true, name: true, origin: true },
  });
  const currentByName = new Map(currentSheets.map((sheet) => [sheet.name, sheet]));
  const replacements = new Map<string, string>();
  const snapshotSheets = records(document.sheets);
  for (const sheet of snapshotSheets) {
    const oldId = text(sheet.id);
    const current = currentByName.get(text(sheet.name));
    const nextId = current?.id ?? (isUuid(oldId) ? oldId : crypto.randomUUID());
    if (oldId) replacements.set(oldId, nextId);
    values(sheet.rowIds).forEach((rowId, index) => {
      if (typeof rowId === "string") replacements.set(rowId, String(index + 1));
    });
  }
  for (const relation of records(document.sheetRelations)) {
    const oldId = text(relation.id);
    if (oldId && !isUuid(oldId)) replacements.set(oldId, crypto.randomUUID());
  }
  for (const field of records(document.calculatedFields)) {
    const oldId = text(field.id);
    if (oldId && !isUuid(oldId)) replacements.set(oldId, crypto.randomUUID());
  }
  const replaced = replaceStrings(document, replacements) as JsonRecord;
  replaced.sheets = records(replaced.sheets).filter((sheet) => currentByName.get(text(sheet.name))?.origin !== "seed");
  return replaced;
}
