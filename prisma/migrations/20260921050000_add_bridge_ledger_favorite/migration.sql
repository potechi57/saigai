ALTER TABLE "Favorite" ADD COLUMN     "bridgeLedgerId" TEXT;

CREATE UNIQUE INDEX "Favorite_bridgeLedgerId_key" ON "Favorite"("bridgeLedgerId");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_bridgeLedgerId_fkey" FOREIGN KEY ("bridgeLedgerId") REFERENCES "BridgeLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
