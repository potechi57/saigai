-- CreateTable
CREATE TABLE "FacilityListItem" (
    "id" TEXT NOT NULL,
    "managementNo" TEXT NOT NULL,
    "oldManagementNo" TEXT,
    "officeName" TEXT,
    "facilityField" TEXT,
    "routeType" TEXT,
    "routeName" TEXT,
    "facilityType" TEXT,
    "facilitySubType" TEXT,
    "facilityName" TEXT,
    "location" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "constructionYear" TEXT,
    "remarks" TEXT,
    "regulationLedgerName" TEXT,
    "regulationLedgerUpdatedAt" TEXT,
    "facilityLedgerName" TEXT,
    "facilityLedgerUpdatedAt" TEXT,
    "inspectionType" TEXT,
    "soundnessGrade" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "inspector" TEXT,
    "mainFindings" TEXT,
    "repairDate" TEXT,
    "repairRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacilityListItem_managementNo_key" ON "FacilityListItem"("managementNo");

-- CreateIndex
CREATE INDEX "FacilityListItem_officeName_idx" ON "FacilityListItem"("officeName");

-- CreateIndex
CREATE INDEX "FacilityListItem_facilityType_idx" ON "FacilityListItem"("facilityType");
