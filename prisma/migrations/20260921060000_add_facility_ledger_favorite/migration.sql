ALTER TABLE "Favorite" ADD COLUMN     "facilityLedgerId" TEXT;

CREATE UNIQUE INDEX "Favorite_facilityLedgerId_key" ON "Favorite"("facilityLedgerId");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_facilityLedgerId_fkey" FOREIGN KEY ("facilityLedgerId") REFERENCES "FacilityLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
