ALTER TABLE "BridgeInspection" ADD COLUMN     "bridgeLengthM" DECIMAL(6,2),
ADD COLUMN     "emergencyTransportRoad" TEXT,
ADD COLUMN     "hasAlternateRoute" TEXT,
ADD COLUMN     "installedYear" INTEGER,
ADD COLUMN     "managerOrgName" TEXT,
ADD COLUMN     "occupyingObjects" TEXT,
ADD COLUMN     "roadCategory" TEXT,
ADD COLUMN     "roadWidthM" DECIMAL(6,2),
ADD COLUMN     "structureType" TEXT,
ADD COLUMN     "underRoadCondition" TEXT;

ALTER TABLE "BridgeInspectionPhoto" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'overview',
ADD COLUMN     "damageType" TEXT,
ADD COLUMN     "judgment" TEXT,
ADD COLUMN     "memberName" TEXT,
ADD COLUMN     "spanRef" TEXT;
