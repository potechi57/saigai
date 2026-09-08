-- 既存データに重複が無いことを確認済み（karteId,inspectionDateの組で重複0件）。
DROP INDEX IF EXISTS "InspectionEvent_karteId_inspectionDate_idx";
CREATE UNIQUE INDEX "InspectionEvent_karteId_inspectionDate_key" ON "InspectionEvent"("karteId", "inspectionDate");
