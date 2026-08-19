import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL 환경 변수가 필요합니다.");

const globalForPostgres = globalThis as unknown as { aporiaPostgres?: pg.Pool };

const existingPool = globalForPostgres.aporiaPostgres;

export const postgres =
  existingPool ??
  new pg.Pool({
    connectionString,
    // Vercel can run several function instances at once. Keep the per-instance
    // pool deliberately small so low-tier Supabase projects are not exhausted.
    max: Number(process.env.DATABASE_POOL_SIZE ?? 2),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 5_000),
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

if (!existingPool && process.env.VERCEL) attachDatabasePool(postgres);

if (process.env.NODE_ENV !== "production") globalForPostgres.aporiaPostgres = postgres;

export function quoteRegisteredIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error("등록되지 않은 물리 식별자입니다.");
  return `"${value}"`;
}
