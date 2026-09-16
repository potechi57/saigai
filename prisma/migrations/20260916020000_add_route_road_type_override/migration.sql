-- 点検調書（防災＝Karte）の路線名は、施設台帳のような信頼できる道路種別
-- データを持たないため、利用者が/settingsで手動で道路種別を割り当てられる
-- 上書きテーブルを追加する（会話ログ「道路種別が決まっていない道路を手動で
-- 分類できる仕様」参照）。

-- CreateTable
CREATE TABLE "RouteRoadTypeOverride" (
    "id" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "roadTypeGroup" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteRoadTypeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteRoadTypeOverride_routeName_key" ON "RouteRoadTypeOverride"("routeName");
