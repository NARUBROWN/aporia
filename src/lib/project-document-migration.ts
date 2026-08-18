export const currentProjectSchemaVersion = 13;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function migrateProjectDocument(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;

  const legacyItems = Array.isArray(value.items) ? value.items : [];
  const sourcePages = Array.isArray(value.pages) ? value.pages : [];
  const pages = sourcePages
    .filter(isRecord)
    .map((page, index) => ({
      ...page,
      id: stringValue(page.id, `page-${index + 1}`),
      name: stringValue(page.name, index === 0 ? "첫 화면" : `페이지 ${index + 1}`),
      path: stringValue(page.path, index === 0 ? "/" : `/page-${index + 1}`),
      items: Array.isArray(page.items) ? page.items : [],
    }));
  if (pages.length === 0)
    pages.push({
      id: "page-1",
      name: "첫 화면",
      path: "/",
      items: legacyItems,
    });

  const requestedActivePageId = stringValue(value.activePageId, "");
  const activePageId = pages.some((page) => page.id === requestedActivePageId)
    ? requestedActivePageId
    : pages[0].id;
  const sourceCanvasView = isRecord(value.canvasView) ? value.canvasView : {};
  const sheets = Array.isArray(value.sheets) ? value.sheets : [];
  const firstSheet = isRecord(sheets[0]) ? sheets[0] : {};
  const secondSheet = isRecord(sheets[1]) ? sheets[1] : firstSheet;
  const sourceDataBinding = isRecord(value.dataBinding)
    ? value.dataBinding
    : {};

  const { items: _legacyItems, ...document } = value;
  void _legacyItems;
  return {
    ...document,
    schemaVersion: currentProjectSchemaVersion,
    pages,
    activePageId,
    canvasView: {
      x: typeof sourceCanvasView.x === "number" ? sourceCanvasView.x : 100,
      y: typeof sourceCanvasView.y === "number" ? sourceCanvasView.y : 55,
      zoom:
        typeof sourceCanvasView.zoom === "number" ? sourceCanvasView.zoom : 0.9,
    },
    sheets,
    sheetFolders: Array.isArray(value.sheetFolders) ? value.sheetFolders : [],
    dataBinding: {
      primarySheet: stringValue(sourceDataBinding.primarySheet, stringValue(firstSheet.id, "")),
      joinedSheet: stringValue(sourceDataBinding.joinedSheet, stringValue(secondSheet.id, "")),
      linkSourceId: stringValue(sourceDataBinding.linkSourceId, stringValue(firstSheet.id, "")),
      connectionPath: Array.isArray(sourceDataBinding.connectionPath)
        ? sourceDataBinding.connectionPath
        : [],
      selectedCandidateId: stringValue(sourceDataBinding.selectedCandidateId, ""),
      relationType: stringValue(sourceDataBinding.relationType, "N:1"),
    },
    displayBindings: isRecord(value.displayBindings) ? value.displayBindings : {},
    filterBindings: isRecord(value.filterBindings) ? value.filterBindings : {},
    sheetRelations: Array.isArray(value.sheetRelations)
      ? value.sheetRelations
      : [],
    calculatedFields: Array.isArray(value.calculatedFields)
      ? value.calculatedFields
      : [],
  };
}
