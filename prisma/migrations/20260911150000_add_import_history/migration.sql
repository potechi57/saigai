-- CreateEnum
CREATE TYPE "ImportHistoryStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL,
    "status" "ImportHistoryStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "fileName" TEXT NOT NULL,
    "facilityNo" TEXT,
    "targetCount" INTEGER,
    "eventCount" INTEGER,
    "errorMessage" TEXT,
    "importedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportHistory_startedAt_idx" ON "ImportHistory"("startedAt");
