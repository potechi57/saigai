-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "gateSignInspectionId" TEXT,
ALTER COLUMN "karteId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_gateSignInspectionId_key" ON "Favorite"("gateSignInspectionId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_gateSignInspectionId_fkey" FOREIGN KEY ("gateSignInspectionId") REFERENCES "GateSignInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
