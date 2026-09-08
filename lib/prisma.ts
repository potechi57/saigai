import { PrismaClient } from "@prisma/client";

// Next.jsの開発モードではモジュールがホットリロードのたびに再評価されるため、
// グローバルにキャッシュしてPrismaClientの多重生成（DBコネクション枯渇）を防ぐ。
// 参照: https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
