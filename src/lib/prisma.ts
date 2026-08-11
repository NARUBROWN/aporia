import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

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
    adapter: new PrismaPg({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.aporiaPrisma = prisma;
}
