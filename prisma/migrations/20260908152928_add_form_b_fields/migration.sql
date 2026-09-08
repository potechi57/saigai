ALTER TABLE "InspectionTarget"
  ADD COLUMN "keyPoints" TEXT,
  ADD COLUMN "checkItems" TEXT,
  ADD COLUMN "createdOnSiteDate" TIMESTAMP(3),
  ADD COLUMN "createdOnSiteWeather" "Weather";
