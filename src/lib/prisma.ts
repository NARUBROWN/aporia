import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { postgres } from "@/lib/postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL 환경 변수가 필요합니다.");
}

const globalForPrisma = globalThis as unknown as {
  aporiaPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.aporiaPrisma ??
  new PrismaClient({
    // Prisma and the normalized-sheet SQL path share one bounded pool. This
    // prevents both clients from competing for separate Supabase connections.
    adapter: new PrismaPg(postgres),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.aporiaPrisma = prisma;
}
