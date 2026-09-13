-- 台帳（画像。FacilityLedger）を「1施設1画像」から「1施設・複数画像（タブ切替）」に
-- 対応させる（会話ログ参照。同じ施設で調書・図面等をまとめて登録したり、後から
-- 追加したりできるようにする）。あわせて、管理番号が無い画像台帳（施設名のみで
-- 管理される施設。例:「魚瀬トンネル」）にも対応するため、FacilityLedgerに
-- managementNo（任意）を追加する。

-- 管理番号（任意）を追加
ALTER TABLE "FacilityLedger" ADD COLUMN "managementNo" TEXT;

-- 画像を複数持てるようにする専用テーブル
CREATE TABLE "FacilityLedgerImage" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityLedgerImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityLedgerImage_ledgerId_idx" ON "FacilityLedgerImage"("ledgerId");

ALTER TABLE "FacilityLedgerImage"
  ADD CONSTRAINT "FacilityLedgerImage_ledgerId_fkey"
  FOREIGN KEY ("ledgerId") REFERENCES "FacilityLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 既存データの移行: これまでFacilityLedger本体に1つだけ持っていたimageUrlを、
-- 「画像1」というラベル（タブ名。後から自由に変更可能）のFacilityLedgerImageとして
-- 1件ずつ複製する。idはPrisma側のcuid()生成を経由しないため、この移行専用に
-- その場で一意な文字列を作る（主キーとして一意でありさえすればよく、cuid形式
-- である必要は無いため）。
INSERT INTO "FacilityLedgerImage" ("id", "ledgerId", "label", "imageUrl", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "FacilityLedger"."id"),
  "FacilityLedger"."id",
  '画像1',
  "FacilityLedger"."imageUrl",
  0,
  "FacilityLedger"."createdAt",
  "FacilityLedger"."updatedAt"
FROM "FacilityLedger";

-- 移行済みのため、FacilityLedger本体のimageUrlは不要になった
ALTER TABLE "FacilityLedger" DROP COLUMN "imageUrl";
