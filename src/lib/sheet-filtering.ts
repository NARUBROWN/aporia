export type FilterSheet = {
  id: string;
  columns: string[];
  rowIds: string[];
  rows: string[][];
};

export type FilterRelation = {
  id: string;
  sourceSheetId: string;
  sourceColumn: string;
  targetSheetId: string;
  targetColumn: string;
  links?: { sourceRowId: string; targetRowId: string }[];
};

export type FilterTarget = {
  componentId: string;
  sheetId: string;
  relationPath: string[];
};

export type ActiveSheetFilter = {
  sourceSheetId: string;
  sourceColumn: string;
  target: FilterTarget;
  value: string;
};

function relationLinks(
  relation: FilterRelation,
  sheets: FilterSheet[],
) {
  if (relation.links && relation.links.length > 0) return relation.links;
  const source = sheets.find((sheet) => sheet.id === relation.sourceSheetId);
  const target = sheets.find((sheet) => sheet.id === relation.targetSheetId);
  if (!source || !target) return [];
  const sourceColumn = source.columns.indexOf(relation.sourceColumn);
  const targetColumn = target.columns.indexOf(relation.targetColumn);
  if (sourceColumn < 0 || targetColumn < 0) return [];
  return source.rows.flatMap((sourceRow, sourceIndex) =>
    target.rows.flatMap((targetRow, targetIndex) =>
      sourceRow[sourceColumn] === targetRow[targetColumn]
        ? [{
            sourceRowId: source.rowIds[sourceIndex],
            targetRowId: target.rowIds[targetIndex],
          }]
        : [],
    ),
  );
}

export function findShortestRelationPath(
  sourceSheetId: string,
  targetSheetId: string,
  relations: FilterRelation[],
) {
  if (sourceSheetId === targetSheetId) return [];
  const queue = [{ sheetId: sourceSheetId, path: [] as string[] }];
  const visited = new Set([sourceSheetId]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const relation of relations) {
      if (
        relation.sourceSheetId !== current.sheetId &&
        relation.targetSheetId !== current.sheetId
      )
        continue;
      const nextSheetId =
        relation.sourceSheetId === current.sheetId
          ? relation.targetSheetId
          : relation.sourceSheetId;
      if (visited.has(nextSheetId)) continue;
      const path = [...current.path, relation.id];
      if (nextSheetId === targetSheetId) return path;
      visited.add(nextSheetId);
      queue.push({ sheetId: nextSheetId, path });
    }
  }
  return null;
}

function relatedRowIds(
  filter: ActiveSheetFilter,
  relations: FilterRelation[],
  sheets: FilterSheet[],
) {
  const source = sheets.find((sheet) => sheet.id === filter.sourceSheetId);
  if (!source) return new Set<string>();
  const sourceColumn = source.columns.indexOf(filter.sourceColumn);
  if (sourceColumn < 0) return new Set<string>();
  let currentSheetId = source.id;
  let currentRowIds = new Set(
    source.rowIds.filter(
      (_, index) => source.rows[index]?.[sourceColumn] === filter.value,
    ),
  );
  for (const relationId of filter.target.relationPath) {
    const relation = relations.find((candidate) => candidate.id === relationId);
    if (
      !relation ||
      (relation.sourceSheetId !== currentSheetId &&
        relation.targetSheetId !== currentSheetId)
    )
      return new Set<string>();
    const fromSource = relation.sourceSheetId === currentSheetId;
    currentRowIds = new Set(
      relationLinks(relation, sheets).flatMap((link) => {
        const fromRowId = fromSource ? link.sourceRowId : link.targetRowId;
        if (!currentRowIds.has(fromRowId)) return [];
        return [fromSource ? link.targetRowId : link.sourceRowId];
      }),
    );
    currentSheetId = fromSource
      ? relation.targetSheetId
      : relation.sourceSheetId;
  }
  return currentSheetId === filter.target.sheetId
    ? currentRowIds
    : new Set<string>();
}

export function filterSheetRowIndexes(
  targetSheet: FilterSheet,
  filters: ActiveSheetFilter[],
  relations: FilterRelation[],
  sheets: FilterSheet[],
) {
  const applicable = filters.filter(
    (filter) => filter.value && filter.target.sheetId === targetSheet.id,
  );
  if (applicable.length === 0) return targetSheet.rows.map((_, index) => index);
  const allowedByFilter = applicable.map((filter) =>
    relatedRowIds(filter, relations, sheets),
  );
  return targetSheet.rowIds.flatMap((rowId, index) =>
    allowedByFilter.every((allowed) => allowed.has(rowId)) ? [index] : [],
  );
}
