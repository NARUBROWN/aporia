import type { Prisma } from "@/generated/prisma/client";

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
    await transaction.calculatedFieldRecord.create({
      data: {
        id: field.id,
        sheetId: field.resultSheetId,
        name: field.name,
        fieldType: field.kind,
        color: text(field.definition.color),
        displayOrder: field.displayOrder,
        rules: {
          create: {
            id: crypto.randomUUID(),
            stepOrder: 0,
            operation: "definition",
            arguments: field.definition as Prisma.InputJsonValue,
          },
        },
      },
    });
  }
}

export function withoutNormalizedDefinitions(document: JsonRecord): Prisma.InputJsonValue {
  return { ...document, sheetRelations: [], calculatedFields: [] } as Prisma.InputJsonValue;
}
