-- CreateEnum
CREATE TYPE "FacilityLedgerCategory" AS ENUM ('TUNNEL');

-- CreateTable
CREATE TABLE "FacilityLedger" (
    "id" TEXT NOT NULL,
    "category" "FacilityLedgerCategory" NOT NULL DEFAULT 'TUNNEL',
    "name" TEXT NOT NULL,
    "routeName" TEXT,
    "location" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "imageUrl" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityLedger_category_idx" ON "FacilityLedger"("category");
