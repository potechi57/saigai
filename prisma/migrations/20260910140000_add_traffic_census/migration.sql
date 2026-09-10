-- 様式Ａの「センサス」欄（交通量の出典となる道路交通センサスの調査年度・
-- 観測地点番号）。prisma/schema.prisma の Karte.trafficCensusYear /
-- trafficCensusPointCode のコメントも参照。
ALTER TABLE "Karte"
  ADD COLUMN "trafficCensusYear" TEXT,
  ADD COLUMN "trafficCensusPointCode" TEXT;
