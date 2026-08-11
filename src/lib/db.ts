import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경 변수가 필요합니다.");
}

const globalForDb = globalThis as unknown as { aporiaPool?: Pool };

export const db = globalForDb.aporiaPool ?? new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.aporiaPool = db;
}
