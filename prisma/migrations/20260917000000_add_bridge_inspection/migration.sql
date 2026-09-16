-- 点検調書（道路＞橋梁）の取込用テーブルを追加する（会話ログ「過去の門型標識点検の
-- エクセルファイルを参考に橋梁の点検様式の取り込みもできるようにしてほしい」参照。
-- 点検調書（門型標識＝GateSignInspection）と同じ様式体系の橋梁版）。

-- CreateTable
CREATE TABLE "BridgeInspection" (
    "id" TEXT NOT NULL,
    "facilityListItemId" TEXT,
    "managementNo" TEXT,
    "bridgeName" TEXT,
    "bridgeNameKana" TEXT,
    "routeName" TEXT,
    "location" TEXT,
    "officeName" TEXT,
    "spanCount" INTEGER,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "inspectionDate" TIMESTAMP(3),
    "inspectorCompany" TEXT,
    "responsiblePerson" TEXT,
    "overallJudgment" TEXT,
    "overallFindings" TEXT,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeInspectionMember" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "spanNo" INTEGER NOT NULL,
    "pageNo" INTEGER NOT NULL DEFAULT 1,
    "photoNo" INTEGER,
    "memberName" TEXT,
    "memberDetail" TEXT,
    "damageType" TEXT,
    "findings" TEXT,
    "photoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BridgeInspectionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeInspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BridgeInspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BridgeInspection_managementNo_idx" ON "BridgeInspection"("managementNo");

-- CreateIndex
CREATE INDEX "BridgeInspection_facilityListItemId_idx" ON "BridgeInspection"("facilityListItemId");

-- CreateIndex
CREATE INDEX "BridgeInspectionMember_inspectionId_idx" ON "BridgeInspectionMember"("inspectionId");

-- CreateIndex
CREATE INDEX "BridgeInspectionPhoto_inspectionId_idx" ON "BridgeInspectionPhoto"("inspectionId");

-- AddForeignKey
ALTER TABLE "BridgeInspection" ADD CONSTRAINT "BridgeInspection_facilityListItemId_fkey" FOREIGN KEY ("facilityListItemId") REFERENCES "FacilityListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeInspectionMember" ADD CONSTRAINT "BridgeInspectionMember_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "BridgeInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeInspectionPhoto" ADD CONSTRAINT "BridgeInspectionPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "BridgeInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
