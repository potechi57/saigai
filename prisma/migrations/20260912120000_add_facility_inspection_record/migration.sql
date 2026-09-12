-- CreateTable
CREATE TABLE "FacilityInspectionRecord" (
    "id" TEXT NOT NULL,
    "facilityListItemId" TEXT NOT NULL,
    "inspectionType" TEXT,
    "soundnessGrade" TEXT,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspector" TEXT,
    "mainFindings" TEXT,
    "repairDate" TEXT,
    "repairRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityInspectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityInspectionRecord_facilityListItemId_idx" ON "FacilityInspectionRecord"("facilityListItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityInspectionRecord_facilityListItemId_inspectionDate_key" ON "FacilityInspectionRecord"("facilityListItemId", "inspectionDate");

-- AddForeignKey
ALTER TABLE "FacilityInspectionRecord" ADD CONSTRAINT "FacilityInspectionRecord_facilityListItemId_fkey" FOREIGN KEY ("facilityListItemId") REFERENCES "FacilityListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
