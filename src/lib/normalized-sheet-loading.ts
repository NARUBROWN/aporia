export type SheetRelationEndpoints = {
  sourceSheetId: string;
  targetSheetId: string;
};

export function expandRelatedSheetIds(
  directSheetIds: Iterable<string>,
  relations: SheetRelationEndpoints[],
) {
  const requiredSheetIds = new Set(directSheetIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    relations.forEach((relation) => {
      if (
        !requiredSheetIds.has(relation.sourceSheetId) &&
        !requiredSheetIds.has(relation.targetSheetId)
      )
        return;
      const previousSize = requiredSheetIds.size;
      requiredSheetIds.add(relation.sourceSheetId);
      requiredSheetIds.add(relation.targetSheetId);
      if (requiredSheetIds.size !== previousSize) expanded = true;
    });
  }
  return requiredSheetIds;
}
