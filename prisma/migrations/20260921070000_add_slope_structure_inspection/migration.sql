-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "slopeStructureInspectionId" TEXT;

-- CreateTable
CREATE TABLE "SlopeStructureInspection" (
    "id" TEXT NOT NULL,
    "facilityListItemId" TEXT,
    "managementNo" TEXT,
    "structureType" TEXT,
    "managerOrgName" TEXT,
    "routeName" TEXT,
    "location" TEXT,
    "distanceMarkFrom" TEXT,
    "distanceMarkTo" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "inspectionDate" TIMESTAMP(3),
    "photoDate" TIMESTAMP(3),
    "weather" TEXT,
    "structureScore" DECIMAL(6,2),
    "groundScore" DECIMAL(6,2),
    "overallJudgment" TEXT,
    "geologyDescription" TEXT,
    "summaryComment" TEXT,
    "inspectionFindings" TEXT,
    "dailyInspectionPoints" TEXT,
    "sourceFileName" TEXT,
    "previousInspectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlopeStructureInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlopeStructureInspectionSheet" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "grid" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlopeStructureInspectionSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlopeStructureInspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'overview',

    CONSTRAINT "SlopeStructureInspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlopeStructureInspection_previousInspectionId_key" ON "SlopeStructureInspection"("previousInspectionId");

-- CreateIndex
CREATE INDEX "SlopeStructureInspection_managementNo_idx" ON "SlopeStructureInspection"("managementNo");

-- CreateIndex
CREATE INDEX "SlopeStructureInspection_facilityListItemId_idx" ON "SlopeStructureInspection"("facilityListItemId");

-- CreateIndex
CREATE INDEX "SlopeStructureInspectionSheet_inspectionId_idx" ON "SlopeStructureInspectionSheet"("inspectionId");

-- CreateIndex
CREATE INDEX "SlopeStructureInspectionPhoto_inspectionId_idx" ON "SlopeStructureInspectionPhoto"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_slopeStructureInspectionId_key" ON "Favorite"("slopeStructureInspectionId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_slopeStructureInspectionId_fkey" FOREIGN KEY ("slopeStructureInspectionId") REFERENCES "SlopeStructureInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlopeStructureInspection" ADD CONSTRAINT "SlopeStructureInspection_facilityListItemId_fkey" FOREIGN KEY ("facilityListItemId") REFERENCES "FacilityListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlopeStructureInspection" ADD CONSTRAINT "SlopeStructureInspection_previousInspectionId_fkey" FOREIGN KEY ("previousInspectionId") REFERENCES "SlopeStructureInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlopeStructureInspectionSheet" ADD CONSTRAINT "SlopeStructureInspectionSheet_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SlopeStructureInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlopeStructureInspectionPhoto" ADD CONSTRAINT "SlopeStructureInspectionPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SlopeStructureInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
