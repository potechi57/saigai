// 緊急輸送道路の絞り込み・強調表示（会話ログ「緊急輸送道路の絞り込み・強調表示」
// 参照）。
//
// カルテ（Karte.emergencyRoadCategory）・点検調書＞門型標識（GateSignInspection.
// emergencyTransportRoad）・点検調書＞橋梁（BridgeInspection.emergencyTransportRoad）・
// 橋梁台帳（BridgeLedger.emergencyTransportRoad）がそれぞれExcel由来の実データとして
// 持つ項目だが、表記が発行元ごとに異なる（実データ確認済み: カルテは
// 「１次」「２次」「３次」「指定無」、橋梁台帳は「無」）。「指定が無いことを示す
// 値」以外は全て緊急輸送道路への指定ありとみなす、という1つの判定関数に統一する。
// 施設台帳（FacilityListItem）・法令台帳（FacilityLedger）・法面構造物
// （SlopeStructureInspection）は対応する項目を持たないため対象外
// （実データにその項目自体が存在しないため、対象を推測で広げない）。
export const NOT_DESIGNATED_VALUES = ["指定無", "無", "非該当", "該当なし", "なし"] as const;
const NOT_DESIGNATED_SET = new Set<string>(NOT_DESIGNATED_VALUES);

export function isEmergencyTransportRoad(value: string | null | undefined): boolean {
  if (!value) return false;
  return !NOT_DESIGNATED_SET.has(value.trim());
}
