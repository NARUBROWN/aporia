import type { Prisma } from "@/generated/prisma/client";
import {
  normalizeStoredColumnType,
  validateSheetValue,
  type SheetColumnType,
} from "@/lib/sheet-value-validation";

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class NormalizedDefinitionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function uuid(value: unknown) {
  const normalized = text(value);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function physicalName(prefix: "sheet" | "col", id: string) {
  return `${prefix}_${id.replaceAll("-", "")}`;
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new NormalizedDefinitionError("INVALID_PHYSICAL_NAME", "안전하지 않은 물리 식별자입니다.");
  return `"${value}"`;
}

function postgresType(type: SheetColumnType) {
  if (type === "number") return "NUMERIC";
  if (type === "boolean") return "BOOLEAN";
  if (type === "date") return "TIMESTAMPTZ";
  return "TEXT";
}

function optionalRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function ruleArguments(value: unknown): JsonRecord {
  return optionalRecord(value);
}

type StoredRule = { stepOrder: number; operation: string; arguments: unknown };
type StoredCondition = {
  conditionOrder: number;
  operator: string;
  operandType: string;
  operandValue: string | null;
  sourceColumn?: { name: string; sheetId?: string } | null;
};

export function deserializeCalculatedField(input: {
  id: string;
  name: string;
  fieldType: string;
  color: string | null;
  sheetId: string;
  rules: StoredRule[];
  conditions: StoredCondition[];
}) {
  const orderedRules = [...input.rules].sort((a, b) => a.stepOrder - b.stepOrder);
  const legacy = orderedRules.find((rule) => rule.operation === "definition")?.arguments;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy))
    return { ...legacy, id: input.id, name: input.name, kind: input.fieldType, color: input.color ?? undefined, resultSheetId: input.sheetId };
  const base = { id: input.id, name: input.name, kind: input.fieldType, color: input.color ?? undefined, resultSheetId: input.sheetId };
  if (input.fieldType === "conditionalSum") {
    const meta = ruleArguments(orderedRules.find((rule) => rule.operation === "conditional_sum")?.arguments);
    return {
      ...base,
      sourceSheetId: text(meta.sourceSheetId) ?? "",
      ...(Array.isArray(meta.relationPath) ? { relationPath: meta.relationPath } : {}),
      valueColumn: text(meta.valueColumn) ?? "",
      conditions: [...input.conditions].sort((a, b) => a.conditionOrder - b.conditionOrder).map((condition) => {
        const metaCondition = ruleArguments(orderedRules.find((rule) => rule.operation === `condition_meta:${condition.conditionOrder}`)?.arguments);
        return {
          id: text(metaCondition.id) ?? crypto.randomUUID(),
          sheetId: text(metaCondition.sheetId) ?? undefined,
          ...(Array.isArray(metaCondition.relationPath) ? { relationPath: metaCondition.relationPath } : {}),
          column: condition.sourceColumn?.name ?? "",
          operator: condition.operator,
          operand: condition.operandType === "currentRowField"
            ? { kind: "currentRowField", column: condition.operandValue ?? "" }
            : { kind: "literal", value: condition.operandValue ?? "" },
        };
      }),
    };
  }
  if (input.fieldType === "transform") {
    const meta = ruleArguments(orderedRules.find((rule) => rule.operation === "transform_meta")?.arguments);
    return {
      ...base,
      sourceColumn: text(meta.sourceColumn) ?? "",
      condition: optionalRecord(meta.condition),
      fallback: text(meta.fallback) ?? "empty",
      outputType: text(meta.outputType) ?? undefined,
      steps: orderedRules.filter((rule) => rule.operation.startsWith("transform_step:"))
        .map((rule) => ({ ...ruleArguments(rule.arguments), type: rule.operation.slice("transform_step:".length) })),
    };
  }
  const meta = ruleArguments(orderedRules.find((rule) => rule.operation === "arithmetic_meta")?.arguments);
  const token = (rule: StoredRule) => ({ ...ruleArguments(rule.arguments), kind: rule.operation.split(":").at(-1) });
  const formula = orderedRules.filter((rule) => rule.operation.startsWith("formula:")).map(token);
  const cases = [...input.conditions].sort((a, b) => a.conditionOrder - b.conditionOrder).map((condition) => ({
    id: condition.operandType,
    value: condition.operandValue ?? "",
    formula: orderedRules.filter((rule) => rule.operation.startsWith(`case:${condition.conditionOrder}:`)).map(token),
  }));
  return {
    ...base,
    relationIds: array(meta.relationIds),
    formula,
    ...(text(meta.conditionColumn) ? { condition: { column: text(meta.conditionColumn), cases } } : {}),
  };
}

/** JSON으로 들어온 신규 수동 시트를 같은 저장 트랜잭션에서 정규화 구조로 승격한다. */
export async function syncDocumentSheets(
  transaction: Prisma.TransactionClient,
  projectId: string,
  document: JsonRecord,
) {
  if (!Array.isArray(document.sheets)) return;
  const requestedSheets = records(document.sheets);
  const names = new Set<string>();

  for (let sheetOrder = 0; sheetOrder < requestedSheets.length; sheetOrder++) {
    const sheet = requestedSheets[sheetOrder];
    const sheetId = uuid(sheet.id);
    const sheetName = text(sheet.name);
    const columns = Array.isArray(sheet.columns) ? sheet.columns.map(text) : [];
    const requestedTypes = Array.isArray(sheet.columnTypes) ? sheet.columnTypes : [];
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const rowIds = Array.isArray(sheet.rowIds) ? sheet.rowIds : [];
    if (!sheetId || !sheetName || columns.length === 0 || columns.some((name) => !name))
      throw new NormalizedDefinitionError("INVALID_SHEET", "시트 ID, 이름 또는 컬럼 구성이 올바르지 않습니다.");
    if (names.has(sheetName) || new Set(columns).size !== columns.length)
      throw new NormalizedDefinitionError("DUPLICATE_SHEET_STRUCTURE", "시트 이름 또는 컬럼 이름이 중복되었습니다.");
    names.add(sheetName);
    if (rows.some((row) => !Array.isArray(row) || row.length !== columns.length))
      throw new NormalizedDefinitionError("INVALID_SHEET_ROWS", "행과 컬럼의 개수가 일치하지 않습니다.");

    const existing = await transaction.projectSheet.findUnique({
      where: { id: sheetId },
      select: { projectId: true, origin: true, physicalTableName: true },
    });
    if (existing && (existing.projectId !== projectId || existing.origin === "seed"))
      throw new NormalizedDefinitionError("SHEET_ID_COLLISION", "기존 정규화 시트는 JSON 저장 경로에서 덮어쓸 수 없습니다.");
    if (existing) {
      await transaction.projectSheet.delete({ where: { id: sheetId } });
      await transaction.$executeRawUnsafe(
        `DROP TABLE project_data.${quoteIdentifier(existing.physicalTableName)}`,
      );
    }

    const types = columns.map((_, index) =>
      normalizeStoredColumnType(typeof requestedTypes[index] === "string" ? requestedTypes[index] : "text"),
    );
    const columnColors = optionalRecord(sheet.columnColors);
    const columnComments = optionalRecord(sheet.columnComments);
    const columnIds = columns.map(() => crypto.randomUUID());
    const physicalColumns = columnIds.map((id) => physicalName("col", id));
    const physicalTableName = physicalName("sheet", sheetId);

    await transaction.projectSheet.create({
      data: {
        id: sheetId,
        projectId,
        name: sheetName,
        physicalTableName,
        color: text(sheet.color),
        comment: text(sheet.comment),
        displayOrder: sheetOrder,
        origin: "manual_document",
        rowCount: rows.length,
        columns: {
          create: columns.map((columnName, columnOrder) => ({
            id: columnIds[columnOrder],
            name: columnName!,
            physicalColumnName: physicalColumns[columnOrder],
            dataType: types[columnOrder],
            displayOrder: columnOrder,
            color: text(columnColors[columnName!]),
            comment: text(columnComments[columnName!]),
          })),
        },
      },
    });
    const ddl = physicalColumns
      .map((name, index) => `${quoteIdentifier(name)} ${postgresType(types[index])}`)
      .join(", ");
    await transaction.$executeRawUnsafe(
      `CREATE TABLE project_data.${quoteIdentifier(physicalTableName)}
        (_row_id BIGINT PRIMARY KEY, _row_order BIGINT NOT NULL UNIQUE, _data_revision BIGINT NOT NULL DEFAULT 0, ${ddl})`,
    );

    const usedRowIds = new Set<string>();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const requestedRowId = typeof rowIds[rowIndex] === "string" ? rowIds[rowIndex] : "";
      if (!/^[1-9]\d*$/.test(requestedRowId) || usedRowIds.has(requestedRowId))
        throw new NormalizedDefinitionError("INVALID_ROW_ID", "행 ID는 중복되지 않는 양의 정수여야 합니다.");
      usedRowIds.add(requestedRowId);
      const values = (rows[rowIndex] as unknown[]).map((value, columnIndex) => {
        const source = value === null || value === undefined ? "" : String(value);
        const validation = validateSheetValue(types[columnIndex], source);
        if (!validation.valid)
          throw new NormalizedDefinitionError("INVALID_SHEET_VALUE", `${sheetName} ${rowIndex + 1}행: ${validation.message}`);
        if (validation.value === "") return null;
        if (types[columnIndex] === "boolean") return validation.value === "예";
        return validation.value;
      });
      const parameters = [requestedRowId, rowIndex, ...values];
      const placeholders = parameters.map((_, index) => `$${index + 1}`).join(", ");
      await transaction.$executeRawUnsafe(
        `INSERT INTO project_data.${quoteIdentifier(physicalTableName)}
          (_row_id, _row_order, ${physicalColumns.map(quoteIdentifier).join(", ")})
         VALUES (${placeholders})`,
        ...parameters,
      );
    }
  }
}

export async function syncNormalizedDefinitions(
  transaction: Prisma.TransactionClient,
  projectId: string,
  document: JsonRecord,
) {
  if (!Array.isArray(document.sheetRelations) || !Array.isArray(document.calculatedFields)) return;
  const requestedRelations = records(document.sheetRelations);
  const requestedFields = records(document.calculatedFields);
  const sheets = await transaction.projectSheet.findMany({
    where: { projectId },
    select: { id: true, columns: { select: { id: true, name: true } } },
  });
  const sheetMap = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const findColumn = (sheetId: string, name: string) =>
    sheetMap.get(sheetId)?.columns.find((item) => item.name === name);

  const relationRows = requestedRelations.map((relation) => {
    const id = text(relation.id);
    const sourceSheetId = text(relation.sourceSheetId);
    const targetSheetId = text(relation.targetSheetId);
    const sourceColumnName = text(relation.sourceColumn);
    const targetColumnName = text(relation.targetColumn);
    const relationType = text(relation.relationType);
    if (!id || !sourceSheetId || !targetSheetId || !sourceColumnName || !targetColumnName || !relationType)
      throw new NormalizedDefinitionError("INVALID_RELATION", "관계 정의에 필수 값이 없습니다.");
    const sourceColumn = findColumn(sourceSheetId, sourceColumnName);
    const targetColumn = findColumn(targetSheetId, targetColumnName);
    if (!sourceColumn || !targetColumn)
      throw new NormalizedDefinitionError("ORPHAN_RELATION", "관계가 현재 프로젝트에 없는 시트 또는 컬럼을 참조합니다.");
    if (sourceColumn.id === targetColumn.id)
      throw new NormalizedDefinitionError("SELF_RELATION", "같은 컬럼을 자기 자신에게 연결할 수 없습니다.");
    return {
      id,
      sourceSheetId,
      sourceColumnId: sourceColumn.id,
      targetSheetId,
      targetColumnId: targetColumn.id,
      relationType,
      relationOrigin: text(relation.relationOrigin) ?? "manual",
    };
  });
  const endpointKeys = new Set<string>();
  for (const relation of relationRows) {
    const key = `${relation.sourceColumnId}:${relation.targetColumnId}`;
    if (endpointKeys.has(key))
      throw new NormalizedDefinitionError("DUPLICATE_RELATION", "같은 컬럼 관계가 중복되어 있습니다.");
    endpointKeys.add(key);
  }

  const fieldRows = requestedFields.map((field, displayOrder) => {
    const id = text(field.id);
    const name = text(field.name);
    const resultSheetId = text(field.resultSheetId);
    if (!id || !name || !resultSheetId || !sheetMap.has(resultSheetId))
      throw new NormalizedDefinitionError("ORPHAN_CALCULATED_FIELD", "계산식이 현재 프로젝트에 없는 결과 시트를 참조합니다.");
    return {
      id,
      name,
      resultSheetId,
      kind: text(field.kind) ?? "arithmetic",
      displayOrder,
      definition: field,
    };
  });

  await transaction.calculationCondition.deleteMany({ where: { calculatedField: { sheet: { projectId } } } });
  await transaction.calculationRule.deleteMany({ where: { calculatedField: { sheet: { projectId } } } });
  await transaction.calculatedFieldRecord.deleteMany({ where: { sheet: { projectId } } });
  await transaction.sheetRelation.deleteMany({ where: { sourceSheet: { projectId } } });
  if (relationRows.length) await transaction.sheetRelation.createMany({ data: relationRows });
  for (const field of fieldRows) {
    const definition = field.definition;
    const rules: Array<{ id: string; stepOrder: number; operation: string; arguments: Prisma.InputJsonValue }> = [];
    const conditions: Array<{ id: string; conditionOrder: number; operator: string; operandType: string; operandValue: string | null; sourceColumnId: string | null }> = [];
    let stepOrder = 0;
    const addRule = (operation: string, argumentsValue: unknown) => rules.push({
      id: crypto.randomUUID(), stepOrder: stepOrder++, operation,
      arguments: argumentsValue as Prisma.InputJsonValue,
    });
    if (field.kind === "conditionalSum") {
      addRule("conditional_sum", {
        sourceSheetId: definition.sourceSheetId,
        ...(Array.isArray(definition.relationPath) ? { relationPath: definition.relationPath } : {}),
        valueColumn: definition.valueColumn,
      });
      for (const [conditionOrder, condition] of records(definition.conditions).entries()) {
        const conditionSheetId = text(condition.sheetId) ?? text(definition.sourceSheetId) ?? "";
        const sourceColumn = findColumn(conditionSheetId, text(condition.column) ?? "");
        if (!sourceColumn)
          throw new NormalizedDefinitionError("ORPHAN_CALCULATION_CONDITION", "계산 조건이 없는 컬럼을 참조합니다.");
        const operand = optionalRecord(condition.operand);
        conditions.push({
          id: uuid(condition.id) ?? crypto.randomUUID(),
          conditionOrder,
          operator: text(condition.operator) ?? "eq",
          operandType: text(operand.kind) ?? "literal",
          operandValue: text(operand.value) ?? text(operand.column),
          sourceColumnId: sourceColumn.id,
        });
        addRule(`condition_meta:${conditionOrder}`, {
          id: condition.id,
          sheetId: condition.sheetId,
          ...(Array.isArray(condition.relationPath) ? { relationPath: condition.relationPath } : {}),
        });
      }
    } else if (field.kind === "transform") {
      addRule("transform_meta", {
        sourceColumn: definition.sourceColumn,
        condition: definition.condition,
        fallback: definition.fallback,
        outputType: definition.outputType,
      });
      for (const step of records(definition.steps)) {
        const { type, ...argumentsValue } = step;
        addRule(`transform_step:${text(type) ?? "unknown"}`, argumentsValue);
      }
    } else {
      const arithmeticCondition = optionalRecord(definition.condition);
      addRule("arithmetic_meta", {
        relationIds: array(definition.relationIds),
        conditionColumn: arithmeticCondition.column,
      });
      for (const tokenValue of records(definition.formula)) {
        const { kind, ...argumentsValue } = tokenValue;
        addRule(`formula:${text(kind) ?? "unknown"}`, argumentsValue);
      }
      for (const [conditionOrder, conditionCase] of records(arithmeticCondition.cases).entries()) {
        const conditionColumn = text(arithmeticCondition.column) ?? "";
        const sourceColumn = findColumn(field.resultSheetId, conditionColumn);
        conditions.push({
          id: crypto.randomUUID(), conditionOrder, operator: "eq",
          operandType: text(conditionCase.id) ?? crypto.randomUUID(),
          operandValue: text(conditionCase.value), sourceColumnId: sourceColumn?.id ?? null,
        });
        for (const tokenValue of records(conditionCase.formula)) {
          const { kind, ...argumentsValue } = tokenValue;
          addRule(`case:${conditionOrder}:${text(kind) ?? "unknown"}`, argumentsValue);
        }
      }
    }
    await transaction.calculatedFieldRecord.create({
      data: {
        id: field.id,
        sheetId: field.resultSheetId,
        name: field.name,
        fieldType: field.kind,
        color: text(field.definition.color),
        displayOrder: field.displayOrder,
        rules: { create: rules },
        conditions: { create: conditions },
      },
    });
  }
}

export function withoutNormalizedDefinitions(document: JsonRecord): Prisma.InputJsonValue {
  return { ...document, sheets: [], sheetRelations: [], calculatedFields: [] } as Prisma.InputJsonValue;
}
