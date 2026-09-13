-- FacilityLedgerの分類を訂正する（会話ログ参照）。
-- 以前はFacilityLedger（台帳の画像登録）＝法令台帳と誤って対応付けていたが、
-- 実際には「トンネル台帳」は施設台帳（FACILITY）に属し、法令台帳（LEGAL）側は
-- 「トンネル調書」等の別物である。画像登録という方法自体は法令台帳・施設台帳の
-- 両方で必要になるため、docClassカラムで区別できるようにする。
-- あわせて、種別（category）をコード化されたenumではなく、施設台帳
-- （FacilityListItem.facilityType/facilitySubType）と同じ自由記述の分野・施設名称
-- （lib/facility-taxonomy.ts参照）に置き換え、台帳名（name）を含む主要項目を
-- 全て任意にする（画像さえあれば登録でき、詳細は後から補える運用のため）。
--
-- 適用前にFacilityLedgerのレコードが0件であることを確認済み（既存データの
-- 移行は不要）。

CREATE TYPE "FacilityLedgerDocClass" AS ENUM ('LEGAL', 'FACILITY');

ALTER TABLE "FacilityLedger" DROP COLUMN "category";
DROP TYPE "FacilityLedgerCategory";

ALTER TABLE "FacilityLedger"
  ADD COLUMN "docClass" "FacilityLedgerDocClass" NOT NULL,
  ADD COLUMN "facilityType" TEXT,
  ADD COLUMN "facilitySubType" TEXT,
  ALTER COLUMN "name" DROP NOT NULL;

CREATE INDEX "FacilityLedger_docClass_idx" ON "FacilityLedger"("docClass");
CREATE INDEX "FacilityLedger_facilityType_idx" ON "FacilityLedger"("facilityType");
