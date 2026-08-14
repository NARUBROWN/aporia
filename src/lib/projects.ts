import type { Prisma } from "@/generated/prisma/client";

export type ProjectListItem = {
  id: string;
  name: string;
  description: string;
  componentCount: number;
  updatedAt: string;
  hasPassword: boolean;
};

type ProjectDocument = {
  description?: unknown;
  pages?: Array<{ items?: unknown[] }>;
};

export function emptyProjectDocument(description = ""): Prisma.InputJsonValue {
  return {
    schemaVersion: 13,
    description,
    pages: [
      {
        id: "page-1",
        name: "첫 화면",
        path: "/",
        items: [],
      },
    ],
    activePageId: "page-1",
    canvasView: { x: 100, y: 55, zoom: 0.9 },
    sheets: [],
    dataBinding: {
      primarySheet: "",
      joinedSheet: "",
      linkSourceId: "",
      connectionPath: [],
      selectedCandidateId: "",
      relationType: "N:1",
    },
    displayBindings: {},
    filterBindings: {},
    sheetRelations: [],
    calculatedFields: [],
  };
}

export function toProjectListItem(project: {
  id: string;
  name: string;
  document: unknown;
  updatedAt: Date;
  passwordHash?: string | null;
}): ProjectListItem {
  const document = (project.document ?? {}) as ProjectDocument;
  return {
    id: project.id,
    name: project.name,
    description:
      typeof document.description === "string" ? document.description : "",
    componentCount: Array.isArray(document.pages)
      ? document.pages.reduce(
          (count, page) => count + (Array.isArray(page.items) ? page.items.length : 0),
          0,
        )
      : 0,
    updatedAt: project.updatedAt.toISOString(),
    hasPassword: !!project.passwordHash,
  };
}
