-- 性能監査より: FacilityListItem.routeName / soundnessGrade は検索条件（等価一致）・
-- ドロップダウン選択肢集計（distinct）の両方で使われているが、インデックスが
-- 無かった。現在のデータ量では実行計画上の差は測定誤差レベルだが、今後の
-- データ増加に備えて追加しておく。

CREATE INDEX "FacilityListItem_routeName_idx" ON "FacilityListItem"("routeName");
CREATE INDEX "FacilityListItem_soundnessGrade_idx" ON "FacilityListItem"("soundnessGrade");
