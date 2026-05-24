import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __toroPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__toroPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__toroPrisma = prisma;
}
