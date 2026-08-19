import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../src/lib/prisma";
import {
  hydrateNormalizedSnapshot,
  normalizeSnapshotDocument,
} from "../src/lib/normalized-snapshots";

type JsonRecord = Record<string, unknown>;
const apply = process.argv.includes("--apply");
const offsetArgument = process.argv.find((argument) => argument.startsWith("--offset="));
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const offset = Number(offsetArgument?.split("=")[1] ?? 0);
const limit = Number(limitArgument?.split("=")[1] ?? Number.POSITIVE_INFINITY);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  if (value === null || value === undefined) return value ?? null;
  return value;
}

function semantic(document: JsonRecord) {
  const sheets = (Array.isArray(document.sheets) ? document.sheets : []).map((value) => {
    const sheet = record(value);
    const { columnColors, columnComments, color, comment, ...rest } = sheet;
    const colors = Object.fromEntries(Object.entries(record(columnColors)).filter(([, item]) => typeof item === "string" && item.length > 0));
    const comments = Object.fromEntries(Object.entries(record(columnComments)).filter(([, item]) => typeof item === "string" && item.length > 0));
    return {
      ...rest,
      ...(typeof color === "string" && color.length ? { color } : {}),
      ...(typeof comment === "string" && comment.length ? { comment } : {}),
      ...(Object.keys(colors).length ? { columnColors: colors } : {}),
      ...(Object.keys(comments).length ? { columnComments: comments } : {}),
    };
  });
  const relations = (Array.isArray(document.sheetRelations) ? document.sheetRelations : []).map((value) => {
    const relation = record(value);
    const { links, ...rest } = relation;
    return {
      ...rest,
      ...(Array.isArray(links) && links.length ? { links } : {}),
      relationOrigin: typeof relation.relationOrigin === "string" ? relation.relationOrigin : "manual",
    };
  });
  const fields = (Array.isArray(document.calculatedFields) ? document.calculatedFields : []).map((value) => {
    const field = record(value);
    return { ...field, kind: typeof field.kind === "string" ? field.kind : "arithmetic" };
  });
  return normalize({
    sheets,
    sheetRelations: relations,
    calculatedFields: fields,
  });
}

function firstDifference(actual: unknown, expected: unknown, path = "$" ): string | null {
  if (isDeepStrictEqual(actual, expected)) return null;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return `${path}.length: ${actual.length} !== ${expected.length}`;
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${path}[${index}]`);
      if (difference) return difference;
    }
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualRecord = actual as JsonRecord;
    const expectedRecord = expected as JsonRecord;
    const keys = [...new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)])].sort();
    for (const key of keys) {
      if (!(key in actualRecord)) return `${path}.${key}: missing from hydrated snapshot`;
      if (!(key in expectedRecord)) return `${path}.${key}: unexpectedly present in hydrated snapshot`;
      const difference = firstDifference(actualRecord[key], expectedRecord[key], `${path}.${key}`);
      if (difference) return difference;
    }
  }
  return `${path}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`;
}

async function main() {
  const allSnapshots = await prisma.projectSnapshot.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, document: true } });
  const snapshots = allSnapshots.slice(offset, offset + limit);
  let sheetCount = 0;
  let rowCount = 0;
  let fieldCount = 0;
  for (const [snapshotIndex, snapshot] of snapshots.entries()) {
    await prisma.$transaction(async (transaction) => {
      const source = record(snapshot.document);
      const hasEmbeddedDefinitions = [source.sheets, source.sheetRelations, source.calculatedFields]
        .some((value) => Array.isArray(value) && value.length > 0);
      if (!hasEmbeddedDefinitions) {
        const [normalizedSheets, normalizedRelations, normalizedFields] = await Promise.all([
          transaction.snapshotSheet.count({ where: { snapshotId: snapshot.id } }),
          transaction.snapshotRelation.count({ where: { snapshotId: snapshot.id } }),
          transaction.snapshotCalculatedField.count({ where: { snapshotId: snapshot.id } }),
        ]);
        if (normalizedSheets + normalizedRelations + normalizedFields > 0) return;
      }
      sheetCount += Array.isArray(source.sheets) ? source.sheets.length : 0;
      rowCount += (Array.isArray(source.sheets) ? source.sheets : []).reduce((sum, sheet) => {
        const rows = record(sheet).rows;
        return sum + (Array.isArray(rows) ? rows.length : 0);
      }, 0);
      fieldCount += Array.isArray(source.calculatedFields) ? source.calculatedFields.length : 0;
      const stripped = await normalizeSnapshotDocument(transaction, snapshot.id, source);
      const hydrated = await hydrateNormalizedSnapshot(transaction, snapshot.id, stripped as JsonRecord);
      const difference = firstDifference(semantic(hydrated), semantic(source));
      if (difference) throw new Error(`스냅샷 의미 불일치 ${snapshot.id}: ${difference}`);
      await transaction.projectSnapshot.update({ where: { id: snapshot.id }, data: { document: stripped } });
      if (!apply) throw new Error("DRY_RUN_ROLLBACK");
    }, { timeout: 30_000 }).catch((error) => {
      if (!(error instanceof Error) || error.message !== "DRY_RUN_ROLLBACK") throw error;
    });
    if ((snapshotIndex + 1) % 10 === 0 || snapshotIndex + 1 === snapshots.length)
      console.log(`검증 완료 ${snapshotIndex + 1}/${snapshots.length}`);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", offset, totalSnapshots: allSnapshots.length, snapshots: snapshots.length, sheets: sheetCount, rows: rowCount, calculatedFields: fieldCount, semanticRoundTrip: true }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
