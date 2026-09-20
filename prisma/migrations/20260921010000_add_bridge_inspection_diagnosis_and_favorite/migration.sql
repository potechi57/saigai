ALTER TABLE "BridgeInspection" ADD COLUMN     "memberOverview" JSONB,
ADD COLUMN     "spanDiagnoses" JSONB;

ALTER TABLE "Favorite" ADD COLUMN     "bridgeInspectionId" TEXT;

CREATE UNIQUE INDEX "Favorite_bridgeInspectionId_key" ON "Favorite"("bridgeInspectionId");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_bridgeInspectionId_fkey" FOREIGN KEY ("bridgeInspectionId") REFERENCES "BridgeInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
