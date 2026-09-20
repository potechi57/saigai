ALTER TABLE "GateSignInspection" ADD COLUMN     "previousInspectionId" TEXT;

CREATE UNIQUE INDEX "GateSignInspection_previousInspectionId_key" ON "GateSignInspection"("previousInspectionId");

ALTER TABLE "GateSignInspection" ADD CONSTRAINT "GateSignInspection_previousInspectionId_fkey" FOREIGN KEY ("previousInspectionId") REFERENCES "GateSignInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
