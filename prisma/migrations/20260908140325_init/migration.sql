-- CreateEnum
CREATE TYPE "KarteType" AS ENUM ('ROCKFALL_COLLAPSE', 'ROCK_MASS_COLLAPSE', 'LANDSLIDE', 'AVALANCHE', 'DEBRIS_FLOW', 'EMBANKMENT', 'RETAINING_WALL', 'BRIDGE_FOUNDATION_SCOUR', 'SNOWDRIFT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('GENERAL', 'TOLL');

-- CreateEnum
CREATE TYPE "RoadType" AS ENUM ('EXPRESSWAY', 'NATIONAL_DESIGNATED', 'NATIONAL_UNDESIGNATED', 'MAJOR_PREFECTURAL', 'PREFECTURAL', 'MUNICIPAL_1', 'MUNICIPAL_2', 'MUNICIPAL_OTHER', 'TOLL_ROAD', 'URBAN_EXPRESSWAY');

-- CreateEnum
CREATE TYPE "RoadStatus" AS ENUM ('CURRENT', 'OLD', 'NEW', 'NEWEST');

-- CreateEnum
CREATE TYPE "GeodeticSystem" AS ENUM ('WORLD', 'JAPAN');

-- CreateEnum
CREATE TYPE "Weather" AS ENUM ('SUNNY', 'CLOUDY', 'RAIN', 'SNOW');

-- CreateEnum
CREATE TYPE "ResponseCategory" AS ENUM ('UNEVALUATED', 'COUNTERMEASURE_NEEDED', 'HANDLED_BY_KARTE', 'NO_COUNTERMEASURE_NEEDED', 'COUNTERMEASURE_COMPLETED');

-- CreateEnum
CREATE TYPE "InspectionPeriodType" AS ENUM ('REGULAR', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "PhotoSourceForm" AS ENUM ('FORM_A', 'FORM_B', 'FORM_D', 'GENERAL_RECORD', 'OTHER');

-- CreateTable
CREATE TABLE "Karte" (
    "id" TEXT NOT NULL,
    "facilityNo" TEXT NOT NULL,
    "karteType" "KarteType" NOT NULL,
    "manageOrgName" TEXT,
    "manageOrgCode" TEXT,
    "routeName" TEXT NOT NULL,
    "routeNo" TEXT,
    "distanceMarkerFromKm" DECIMAL(7,3),
    "distanceMarkerToKm" DECIMAL(7,3),
    "sideOfRoad" TEXT,
    "extensionLengthM" DECIMAL(8,1),
    "projectCategory" "ProjectCategory",
    "roadType" "RoadType",
    "roadStatus" "RoadStatus",
    "locationDistrict" TEXT,
    "locationTown" TEXT,
    "landmark" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "geodeticSystem" "GeodeticSystem",
    "preTrafficRestriction" BOOLEAN,
    "continuousRainfallMm" INTEGER,
    "hourlyRainfallMm" INTEGER,
    "trafficVolumeWeekday" INTEGER,
    "trafficVolumeHoliday" INTEGER,
    "didArea" BOOLEAN,
    "busRoute" BOOLEAN,
    "detour" BOOLEAN,
    "emergencyRoadCategory" TEXT,
    "specialistInspectionRequired" BOOLEAN,
    "keyDeformationSummary" TEXT,
    "inspectionContentSummary" TEXT,
    "specialistComment" TEXT,
    "responseCategory" "ResponseCategory" NOT NULL DEFAULT 'UNEVALUATED',
    "responseEvaluatedAt" TIMESTAMP(3),
    "inspectionPeriodType" "InspectionPeriodType",
    "inspectionIntervalNote" TEXT,
    "assumedDisasterForm" TEXT,
    "responseWhenDeformed" TEXT,
    "createdOnSiteDate" TIMESTAMP(3),
    "createdOnSiteWeather" "Weather",
    "inspectorName" TEXT,
    "inspectorCompany" TEXT,
    "inspectorTel" TEXT,
    "specialistName" TEXT,
    "specialistCompany" TEXT,
    "specialistTel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Karte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KarteRockfallDetail" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "mainFormRockfall" BOOLEAN NOT NULL DEFAULT false,
    "mainFormCollapse" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KarteRockfallDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTarget" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionEvent" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspectorName" TEXT,
    "weather" "Weather",
    "specialTopics" TEXT,
    "specialistInspectionDate" TIMESTAMP(3),
    "specialistName" TEXT,
    "specialistJudgement" "ResponseCategory",
    "nextInspectionDueYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "diffFromPrevious" BOOLEAN,
    "disasterHistory" BOOLEAN,
    "repairHistory" BOOLEAN,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisasterEvent" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "targetId" TEXT,
    "disasterType" "KarteType",
    "occurredDate" TIMESTAMP(3),
    "scaleWidthM" DECIMAL(6,2),
    "scaleLengthM" DECIMAL(6,2),
    "scaleDepthM" DECIMAL(6,2),
    "scaleComment" TEXT,
    "rainContinuousMm" INTEGER,
    "rainMaxHourlyMm" INTEGER,
    "seismicIntensity" TEXT,
    "seismicAccelerationGal" INTEGER,
    "snowTemperatureC" DECIMAL(4,1),
    "snowDepthM" DECIMAL(5,2),
    "causeComment" TEXT,
    "damageDeaths" INTEGER,
    "damageInjured" INTEGER,
    "propertyDamageComment" TEXT,
    "propertyDamageAmountMillionYen" DECIMAL(10,1),
    "closureFullHours" DECIMAL(6,1),
    "closurePartialHours" DECIMAL(6,1),
    "shoulderRestriction" BOOLEAN,
    "countermeasureFiscalYear" INTEGER,
    "countermeasureType" TEXT,
    "countermeasureCostMillionYen" DECIMAL(10,1),
    "comment" TEXT,
    "createdOnSiteDate" TIMESTAMP(3),
    "createdOnSiteWeather" "Weather",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisasterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "targetId" TEXT,
    "eventId" TEXT,
    "disasterEventId" TEXT,
    "url" TEXT NOT NULL,
    "sourceForm" "PhotoSourceForm" NOT NULL DEFAULT 'OTHER',
    "takenAt" TIMESTAMP(3),
    "takenBy" TEXT,
    "takenLat" DECIMAL(9,6),
    "takenLng" DECIMAL(9,6),
    "caption" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentDocument" (
    "id" TEXT NOT NULL,
    "karteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Karte_facilityNo_key" ON "Karte"("facilityNo");

-- CreateIndex
CREATE INDEX "Karte_karteType_idx" ON "Karte"("karteType");

-- CreateIndex
CREATE INDEX "Karte_routeName_idx" ON "Karte"("routeName");

-- CreateIndex
CREATE UNIQUE INDEX "KarteRockfallDetail_karteId_key" ON "KarteRockfallDetail"("karteId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTarget_karteId_sequenceNo_key" ON "InspectionTarget"("karteId", "sequenceNo");

-- CreateIndex
CREATE INDEX "InspectionEvent_karteId_inspectionDate_idx" ON "InspectionEvent"("karteId", "inspectionDate");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResult_eventId_targetId_key" ON "InspectionResult"("eventId", "targetId");

-- CreateIndex
CREATE INDEX "DisasterEvent_karteId_occurredDate_idx" ON "DisasterEvent"("karteId", "occurredDate");

-- CreateIndex
CREATE INDEX "Photo_karteId_idx" ON "Photo"("karteId");

-- CreateIndex
CREATE INDEX "Photo_targetId_idx" ON "Photo"("targetId");

-- AddForeignKey
ALTER TABLE "KarteRockfallDetail" ADD CONSTRAINT "KarteRockfallDetail_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTarget" ADD CONSTRAINT "InspectionTarget_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionEvent" ADD CONSTRAINT "InspectionEvent_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InspectionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "InspectionTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisasterEvent" ADD CONSTRAINT "DisasterEvent_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisasterEvent" ADD CONSTRAINT "DisasterEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "InspectionTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "InspectionTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InspectionEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_disasterEventId_fkey" FOREIGN KEY ("disasterEventId") REFERENCES "DisasterEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentDocument" ADD CONSTRAINT "AttachmentDocument_karteId_fkey" FOREIGN KEY ("karteId") REFERENCES "Karte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
