import { prisma } from "@/lib/prisma";
import { isValidPin, verifyPin } from "@/lib/project-security";
import { requestHasOwnedProjectAccess, requestHasProjectWriteAccess, requestIsProjectOwner } from "@/lib/auth";
import {
  NormalizedDefinitionError,
  syncDocumentSheets,
  syncNormalizedDefinitions,
  withoutNormalizedDefinitions,
} from "@/lib/normalized-definitions";
import { snapshotNormalizedProject } from "@/lib/normalized-snapshots";
import { loadProjectSheetMetadata } from "@/lib/project-bootstrap";

type DocumentRecord = Record<string, unknown>;

class ProjectVersionConflictError extends Error {}

function normalizeNumber(value: unknown) {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^-?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(trimmed))
    return null;
  const normalized = trimmed.replaceAll(",", "");
  return Number.isFinite(Number(normalized)) ? normalized : null;
}

function normalizeDocumentNumbers(document: DocumentRecord) {
  const sheets = document.sheets;
  if (!Array.isArray(sheets)) return { document };

  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") continue;
    const record = sheet as DocumentRecord;
    const columns = record.columns;
    const columnTypes = record.columnTypes;
    const rows = record.rows;
    if (
      !Array.isArray(columns) ||
      !Array.isArray(columnTypes) ||
      !Array.isArray(rows)
    )
      continue;

    for (let columnIndex = 0; columnIndex < columnTypes.length; columnIndex++) {
      if (columnTypes[columnIndex] !== "number") continue;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!Array.isArray(row)) continue;
        const normalized = normalizeNumber(row[columnIndex]);
        if (normalized === null) {
          return {
            error: {
              code: "INVALID_NUMBER_CELL",
              sheet: typeof record.name === "string" ? record.name : "",
              column:
                typeof columns[columnIndex] === "string"
                  ? columns[columnIndex]
                  : "",
              row: rowIndex + 1,
              value: row[columnIndex],
            },
          };
        }
        row[columnIndex] = normalized;
      }
    }
  }
  return { document };
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      document: true,
      createdAt: true,
      version: true,
      updatedAt: true,
      passwordHash: true,
      ownerId: true,
    },
  });

  if (!project) {
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }
  if (!await requestHasOwnedProjectAccess(request, id, project.ownerId, project.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  const includeBootstrap = new URL(request.url).searchParams.get("bootstrap") === "1";
  const normalizedMetadata = includeBootstrap
    ? await loadProjectSheetMetadata(id)
    : undefined;
  return Response.json(
    {
      project: {
        id: project.id,
        name: project.name,
        document: project.document,
        createdAt: project.createdAt.toISOString(),
        version: Number(project.version),
        updatedAt: project.updatedAt.toISOString(),
      },
      ...(normalizedMetadata ? { normalizedMetadata } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const existing = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { passwordHash: true, ownerId: true },
  });
  if (!existing)
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasProjectWriteAccess(request, id, existing.ownerId, existing.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120)
    return Response.json({ error: "INVALID_PROJECT_NAME" }, { status: 400 });

  const project = await prisma.project.update({
    where: { id },
    data: { name },
    select: { id: true, name: true, version: true, updatedAt: true },
  });
  return Response.json({
    project: {
      ...project,
      version: Number(project.version),
      updatedAt: project.updatedAt.toISOString(),
    },
  });
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const { id } = await context.params;
  const existing = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true, ownerId: true } });
  if (!existing) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (!await requestHasProjectWriteAccess(request, id, existing.ownerId, existing.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  const raw = await request.text();

  if (raw.length > 5_000_000) {
    return Response.json({ error: "DOCUMENT_TOO_LARGE" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("document" in body) ||
    typeof body.document !== "object" ||
    !body.document
  ) {
    return Response.json({ error: "INVALID_DOCUMENT" }, { status: 400 });
  }

  const normalized = normalizeDocumentNumbers(body.document as DocumentRecord);
  if (normalized.error) {
    return Response.json(normalized.error, { status: 422 });
  }
  const requestedName =
    "name" in body && typeof body.name === "string"
      ? body.name.trim()
      : undefined;
  if ("name" in body && (!requestedName || requestedName.length > 120)) {
    return Response.json({ error: "INVALID_PROJECT_NAME" }, { status: 400 });
  }
  const sourceDocument = normalized.document as DocumentRecord;
  const document = withoutNormalizedDefinitions(sourceDocument);
  const baseVersion =
    "baseVersion" in body && typeof body.baseVersion === "number"
      ? body.baseVersion
      : undefined;
  if (
    "baseVersion" in body &&
    (!Number.isSafeInteger(baseVersion) || (baseVersion ?? 0) < 1)
  )
    return Response.json({ error: "INVALID_BASE_VERSION" }, { status: 400 });
  const snapshotReason =
    "snapshotReason" in body && body.snapshotReason === "manual_save"
      ? "manual_save"
      : null;
  let project;
  try {
    project = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.project.updateMany({
        where: {
          id,
          ...(baseVersion === undefined ? {} : { version: BigInt(baseVersion) }),
        },
        data: {
          document,
          version: { increment: 1 },
          ...(requestedName ? { name: requestedName } : {}),
        },
      });
      if (updated.count !== 1) throw new ProjectVersionConflictError();
      await syncDocumentSheets(transaction, id, sourceDocument);
      await syncNormalizedDefinitions(transaction, id, sourceDocument);
      const savedProject = await transaction.project.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true, version: true, updatedAt: true },
      });
      if (snapshotReason) {
        const snapshot = await transaction.projectSnapshot.create({
          data: {
            id: crypto.randomUUID(),
            projectId: id,
            document,
            projectVersion: savedProject.version,
            reason: snapshotReason,
          },
        });
        await snapshotNormalizedProject(transaction, snapshot.id, id, sourceDocument);
        return savedProject;
      }
      return savedProject;
    });
  } catch (error) {
    if (error instanceof ProjectVersionConflictError)
      return Response.json({ error: "PROJECT_VERSION_CONFLICT" }, { status: 409 });
    if (error instanceof NormalizedDefinitionError)
      return Response.json(
        { error: error.code, message: error.message },
        { status: 422 },
      );
    throw error;
  }

  return Response.json({
    project: {
      id: project.id,
      name: project.name,
      version: Number(project.version),
      updatedAt: project.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/projects/[id]">) {
  const { id } = await context.params;
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { passwordHash: true, ownerId: true } });
  if (!project) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  if (project.ownerId
    ? !await requestIsProjectOwner(request, project.ownerId)
    : !await requestHasOwnedProjectAccess(request, id, project.ownerId, project.passwordHash))
    return Response.json({ error: "PROJECT_LOCKED" }, { status: 401 });
  if (project.passwordHash) {
    const body = await request.json().catch(() => null) as { pin?: unknown } | null;
    if (!isValidPin(body?.pin) || !verifyPin(body.pin, project.passwordHash))
      return Response.json({ error: "INVALID_PIN" }, { status: 401 });
  }
  await prisma.project.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true },
  });
  return Response.json({ ok: true });
}
