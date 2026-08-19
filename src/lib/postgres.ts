import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL 환경 변수가 필요합니다.");

const globalForPostgres = globalThis as unknown as { aporiaPostgres?: pg.Pool };

export const postgres =
  globalForPostgres.aporiaPostgres ??
  new pg.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

if (process.env.NODE_ENV !== "production") globalForPostgres.aporiaPostgres = postgres;

export function quoteRegisteredIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error("등록되지 않은 물리 식별자입니다.");
  return `"${value}"`;
}
