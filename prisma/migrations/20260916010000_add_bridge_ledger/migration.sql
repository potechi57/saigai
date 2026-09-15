-- 橋梁台帳（島根県 橋梁点検・橋梁台帳システム(IMS)由来のExcel）の取込・表示に
-- 対応する（会話ログ参照）。「橋梁調書」シート（基本諸元、約50項目）は点検調書
-- （GateSignInspection）と同じ方針で項目ごとに列化するが、「橋梁台帳」
-- 「画像」「付属図」の各シートは490箇所超のセル結合を持つ非常に密な構造設計・
-- 数量計算の帳票のため、個々の項目をDB列化せず、セル値・結合・列幅・行高を
-- JSON（BridgeLedgerSheet.grid）のまま保持し、表示時に汎用のExcelグリッド
-- 再現コンポーネントで見た目だけ忠実に再現する。

-- CreateTable
CREATE TABLE "BridgeLedger" (
    "id" TEXT NOT NULL,
    "facilityListItemId" TEXT,
    "managementNo" TEXT,
    "managementCategory" TEXT,
    "bridgeNameKana" TEXT,
    "bridgeName" TEXT,
    "officeName" TEXT,
    "routeName" TEXT,
    "spanCount" INTEGER,
    "constructedAt" TEXT,
    "location" TEXT,
    "bridgeType" TEXT,
    "bridgeLengthM" DECIMAL(6,2),
    "superstructureType" TEXT,
    "deckMaterial" TEXT,
    "substructureType" TEXT,
    "appliedSpec" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "widthRoadwayM" DECIMAL(6,2),
    "widthSidewalkM" DECIMAL(6,2),
    "widthShoulderM" DECIMAL(6,2),
    "widthCurbM" DECIMAL(6,2),
    "widthOtherM" DECIMAL(6,2),
    "widthTotalM" DECIMAL(6,2),
    "widthRemarks" TEXT,
    "areaRoadwayM2" DECIMAL(8,2),
    "areaSidewalkM2" DECIMAL(8,2),
    "areaShoulderM2" DECIMAL(8,2),
    "areaCurbM2" DECIMAL(8,2),
    "areaOtherM2" DECIMAL(8,2),
    "areaTotalM2" DECIMAL(8,2),
    "censusNo" TEXT,
    "seismicReinforcement" TEXT,
    "surveyYear" TEXT,
    "trafficVolume" TEXT,
    "largeVehicleTraffic" TEXT,
    "coastDistance" TEXT,
    "emergencyTransportRoad" TEXT,
    "priorityRoute" TEXT,
    "mainGirderCount" INTEGER,
    "abutmentHeightM" DECIMAL(6,2),
    "pierHeightM" DECIMAL(6,2),
    "occupyingObjectName" TEXT,
    "denselyPopulatedArea" TEXT,
    "detourRoute" TEXT,
    "busRoute" TEXT,
    "overpassRailway" TEXT,
    "overpassRoad" TEXT,
    "overseaBridge" TEXT,
    "longBridge" TEXT,
    "saltDamageArea" TEXT,
    "upDownLine" TEXT,
    "bicycleRoad" TEXT,
    "footbridge" TEXT,
    "sideRoadBridge" TEXT,
    "weatheringSteel" TEXT,
    "underRiver" TEXT,
    "underRoad" TEXT,
    "bridgeManagementCategory" TEXT,
    "roadCategory" TEXT,
    "loadRestriction" TEXT,
    "underRailway" TEXT,
    "underOther" TEXT,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeLedgerSheet" (
    "id" TEXT NOT NULL,
    "bridgeLedgerId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "grid" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeLedgerSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BridgeLedger_managementNo_idx" ON "BridgeLedger"("managementNo");

-- CreateIndex
CREATE INDEX "BridgeLedger_facilityListItemId_idx" ON "BridgeLedger"("facilityListItemId");

-- CreateIndex
CREATE INDEX "BridgeLedgerSheet_bridgeLedgerId_idx" ON "BridgeLedgerSheet"("bridgeLedgerId");

-- AddForeignKey
ALTER TABLE "BridgeLedger" ADD CONSTRAINT "BridgeLedger_facilityListItemId_fkey" FOREIGN KEY ("facilityListItemId") REFERENCES "FacilityListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeLedgerSheet" ADD CONSTRAINT "BridgeLedgerSheet_bridgeLedgerId_fkey" FOREIGN KEY ("bridgeLedgerId") REFERENCES "BridgeLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
