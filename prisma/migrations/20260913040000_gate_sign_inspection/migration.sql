-- 点検調書（道路＞門型標識）のExcel取込・表示に対応する（会話ログ参照）。
-- 島根県の「別紙２　様式１様式２」形式の詳細点検報告書（様式１＝基本情報・
-- 総括、様式２＝損傷箇所ごとの写真付き詳細カード）を、FacilityListItem
-- （施設台帳の道路標識行）に管理番号で紐付けて保存する。

CREATE TABLE "GateSignInspection" (
    "id" TEXT NOT NULL,
    "facilityListItemId" TEXT,
    "managementNo" TEXT,
    "facilityName" TEXT,
    "facilityForm" TEXT,
    "routeName" TEXT,
    "location" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "inspectionDate" TIMESTAMP(3),
    "inspectorCompany" TEXT,
    "inspectorName" TEXT,
    "managerOrgName" TEXT,
    "hasAlternateRoute" TEXT,
    "emergencyTransportRoad" TEXT,
    "roadCategory" TEXT,
    "occupyingObjects" TEXT,
    "installedYear" INTEGER,
    "installedMonth" INTEGER,
    "roadWidthM" DECIMAL(6,2),
    "structureType" TEXT,
    "overallJudgment" TEXT,
    "overallFindings" TEXT,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateSignInspection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GateSignInspectionMember" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "photoNo" INTEGER,
    "memberName" TEXT,
    "memberDetail" TEXT,
    "damageType" TEXT,
    "judgment" TEXT,
    "postActionJudgment" TEXT,
    "postActionContent" TEXT,
    "findings" TEXT,
    "remarks" TEXT,
    "photoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GateSignInspectionMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GateSignInspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GateSignInspectionPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GateSignInspection_managementNo_idx" ON "GateSignInspection"("managementNo");
CREATE INDEX "GateSignInspection_facilityListItemId_idx" ON "GateSignInspection"("facilityListItemId");
CREATE INDEX "GateSignInspectionMember_inspectionId_idx" ON "GateSignInspectionMember"("inspectionId");
CREATE INDEX "GateSignInspectionPhoto_inspectionId_idx" ON "GateSignInspectionPhoto"("inspectionId");

ALTER TABLE "GateSignInspection"
  ADD CONSTRAINT "GateSignInspection_facilityListItemId_fkey"
  FOREIGN KEY ("facilityListItemId") REFERENCES "FacilityListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GateSignInspectionMember"
  ADD CONSTRAINT "GateSignInspectionMember_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "GateSignInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GateSignInspectionPhoto"
  ADD CONSTRAINT "GateSignInspectionPhoto_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "GateSignInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
