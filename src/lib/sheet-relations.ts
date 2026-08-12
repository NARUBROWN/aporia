export type RelationEndpoints = {
  sourceSheetId: string;
  sourceColumn: string;
  targetSheetId: string;
  targetColumn: string;
};

export function sameRelationEndpoints(
  left: RelationEndpoints,
  right: RelationEndpoints,
) {
  return (
    left.sourceSheetId === right.sourceSheetId &&
    left.sourceColumn === right.sourceColumn &&
    left.targetSheetId === right.targetSheetId &&
    left.targetColumn === right.targetColumn
  );
}

export function upsertSheetRelation<T extends RelationEndpoints>(
  relations: T[],
  relation: T,
) {
  const existingIndex = relations.findIndex((item) =>
    sameRelationEndpoints(item, relation),
  );
  if (existingIndex < 0) return [...relations, relation];
  return relations.map((item, index) =>
    index === existingIndex ? relation : item,
  );
}
