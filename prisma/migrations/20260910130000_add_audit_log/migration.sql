-- 編集履歴（簡易監査ログ）。ヘッダーの「編集履歴」画面から参照する
-- （prisma/schema.prisma の AuditLog のコメントも参照）。

CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "karteFacilityNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
