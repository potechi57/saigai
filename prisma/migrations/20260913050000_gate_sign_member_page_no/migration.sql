-- 点検調書（門型標識）詳細画面を、元Excelの「状況写真（損傷状況）」シート
-- （様式（その２）／様式（その２）2／様式（その２）3…）ごとのタブ表示に
-- 対応させる（会話ログ参照）。どのシート由来かを1始まりの番号で保持する。

ALTER TABLE "GateSignInspectionMember" ADD COLUMN "pageNo" INTEGER NOT NULL DEFAULT 1;
