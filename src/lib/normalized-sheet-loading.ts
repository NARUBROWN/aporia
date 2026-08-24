export type SheetRelationEndpoints = {
  sourceSheetId: string;
  targetSheetId: string;
};

export type NormalizedSheetLoadState = {
  normalized?: boolean;
  rowCount?: number;
  loadedRowCount: number;
};

export type VirtualRowWindow = {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
};

type VirtualRowWindowOptions = {
  rowCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight?: number;
  overscan?: number;
};

export function virtualRowWindow({
  rowCount,
  scrollTop,
  viewportHeight,
  rowHeight = 29,
  overscan = 8,
}: VirtualRowWindowOptions): VirtualRowWindow {
  if (rowCount <= 0)
    return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };
  if (viewportHeight <= 0) {
    const end = Math.min(rowCount, 100);
    return {
      start: 0,
      end,
      paddingTop: 0,
      paddingBottom: Math.max(0, rowCount - end) * rowHeight,
    };
  }
  const firstVisible = Math.min(
    rowCount - 1,
    Math.max(0, Math.floor(scrollTop / rowHeight)),
  );
  const start = Math.max(0, firstVisible - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);
  return {
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, rowCount - end) * rowHeight,
  };
}

export function needsInitialNormalizedRows(sheet: NormalizedSheetLoadState) {
  return (
    Boolean(sheet.normalized) &&
    (sheet.rowCount ?? 0) > 0 &&
    sheet.loadedRowCount === 0
  );
}

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
