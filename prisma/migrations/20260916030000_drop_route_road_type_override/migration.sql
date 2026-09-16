-- 点検調書（防災＝Karte）の路線名・道路種別の手動設定機能（/settings）を廃止
-- したため、上書きテーブルを削除する（会話ログ「道路種別振り分け機能は
-- なくしてしまってください」参照。分類はlib/karte-route-classification.tsの
-- コード内固定データに一本化した）。

-- DropTable
DROP TABLE "RouteRoadTypeOverride";
