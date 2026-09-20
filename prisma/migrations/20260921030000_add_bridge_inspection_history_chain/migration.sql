ALTER TABLE "BridgeInspection" ADD COLUMN     "previousInspectionId" TEXT;

CREATE UNIQUE INDEX "BridgeInspection_previousInspectionId_key" ON "BridgeInspection"("previousInspectionId");

ALTER TABLE "BridgeInspection" ADD CONSTRAINT "BridgeInspection_previousInspectionId_fkey" FOREIGN KEY ("previousInspectionId") REFERENCES "BridgeInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
