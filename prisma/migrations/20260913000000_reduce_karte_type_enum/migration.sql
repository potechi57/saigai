-- 島根県では防災カルテ点検を「落石・斜面」（落石・崩壊）でのみ運用しているため、
-- KarteTypeから岩盤崩壊・地すべり・雪崩・土石流の4種を除く（prisma/schema.prismaの
-- KarteTypeコメント参照。会話ログ参照）。
--
-- PostgreSQLはenumから値を直接削除できないため、新しいenum型を作り、列の型を
-- 付け替えてから旧型を破棄する（Prisma公式ドキュメントで案内されている定石の手順）。
-- 適用前に、削除対象の値を使っているKarteが無いことを確認済み（地すべり分類の
-- サンプルデータ1件は本マイグレーション作成前に削除済み）。
--
-- 【DisasterEvent.disasterTypeも同じKarteType型を共有していることについて】
-- 「被災種別」（様式Ｄ）はKarteTypeとほぼ同じ語彙のため型を共有している
-- （prisma/schema.prismaのDisasterEvent.disasterTypeコメント参照）。型を
-- 付け替える際、この列も一緒に付け替えないと、旧型（KarteType_old）への
-- 依存が残りDROP TYPEに失敗する（実際に本番相当のDBで検証中に発生した
-- エラー: "cannot drop type ... because other objects depend on it"）。
-- 適用前に、削除対象の値を使っているDisasterEventも無いことを確認済み。
--
-- 【トランザクションで一括実行していないことについて】
-- 検証時、BEGIN/COMMITで囲んだ状態で1文がエラーになると、それ以降の文が
-- 「current transaction is aborted」で一律失敗し、実際にどの文が原因かの
-- 特定に手間取った。ステートメントごとに素直に実行し、途中で失敗した場合は
-- prisma migrate resolveで状態を揃えてから該当箇所だけ手当てする方が
-- 診断しやすかったため、あえてBEGIN/COMMITを付けていない。
CREATE TYPE "KarteType_new" AS ENUM ('ROCKFALL_COLLAPSE', 'EMBANKMENT', 'RETAINING_WALL', 'BRIDGE_FOUNDATION_SCOUR', 'SNOWDRIFT', 'OTHER');

ALTER TABLE "Karte" ALTER COLUMN "karteType" TYPE "KarteType_new" USING ("karteType"::text::"KarteType_new");
ALTER TABLE "DisasterEvent" ALTER COLUMN "disasterType" TYPE "KarteType_new" USING ("disasterType"::text::"KarteType_new");

ALTER TYPE "KarteType" RENAME TO "KarteType_old";
ALTER TYPE "KarteType_new" RENAME TO "KarteType";
DROP TYPE "KarteType_old";
