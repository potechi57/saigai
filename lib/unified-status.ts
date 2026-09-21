// 横断的な「要対応一覧」ダッシュボード（会話ログ「横断的な『要対応一覧』
// ダッシュボード（Ⅰ：対応不要／Ⅱ：経過観察／Ⅲ：要対策で統一表記）」参照）用の
// 判定統一ロジック。
//
// 【前提・注意】カルテ（Karte.responseCategory）・門型標識/橋梁
// （overallJudgment、国交省の健全性診断基準に基づくⅠ〜Ⅳの4段階＝
// 健全/予防保全段階/早期措置段階/緊急措置段階）・法面構造物
// （overallJudgment、Ⅰ〜Ⅲの3段階＝対応不要/経過観察/要対策という応急対応
// 区分）は、見た目は同じローマ数字でも本来別々の評価軸である
// （健全性診断＝構造物の状態そのものの評価、応急対応区分＝点検者が現地で
// 下す対応方針の評価）。この一覧は「今どれだけの箇所が何らかの対応・
// 経過観察を要するか」を横断的に一目で把握できるようにするための実用上の
// 統合であり、元データ（各詳細画面のbadge・生の判定値）は変更しない。
// 一覧の各行には統一区分と併せて元の判定値も表示し、誤解を避ける。
export type UnifiedTier = "no_action" | "monitor" | "action_needed";

export const UNIFIED_TIER_LABEL: Record<UnifiedTier, string> = {
  no_action: "Ⅰ：対応不要",
  monitor: "Ⅱ：経過観察",
  action_needed: "Ⅲ：要対策",
};

export const UNIFIED_TIER_BADGE: Record<UnifiedTier, string> = {
  no_action: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  monitor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  action_needed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// 門型標識・橋梁（Ⅰ〜Ⅳの健全性診断）。ⅢとⅣはいずれも「措置段階」＝
// 対応が必要な状態のため、共に要対策（action_needed）に含める
// （Ⅳの方がより緊急だが、この一覧では「対応が要るかどうか」の粗い括りで
// 十分と判断。Ⅲ/Ⅳの区別自体は一覧内の生の判定バッジで見分けられる）。
export function judgment1to4ToTier(judgment: string | null | undefined): UnifiedTier | null {
  if (judgment === "Ⅰ") return "no_action";
  if (judgment === "Ⅱ") return "monitor";
  if (judgment === "Ⅲ" || judgment === "Ⅳ") return "action_needed";
  return null;
}

// 法面構造物（Ⅰ〜Ⅲの応答区分）。ラベルの意味がUNIFIED_TIER_LABELと
// そのまま一致するため変換は機械的。
export function judgment1to3ToTier(judgment: string | null | undefined): UnifiedTier | null {
  if (judgment === "Ⅰ") return "no_action";
  if (judgment === "Ⅱ") return "monitor";
  if (judgment === "Ⅲ") return "action_needed";
  return null;
}

// カルテ（ResponseCategory）。COUNTERMEASURE_NEEDED＝対策工が必要は
// action_needed、HANDLED_BY_KARTE＝カルテ対応（継続監視で対応する方針）は
// monitor、NO_COUNTERMEASURE_NEEDED（対策不要）・COUNTERMEASURE_COMPLETED
// （対策完了＝措置済みで以後の対応は不要）はno_action。UNEVALUATED（未評価）
// はどちらとも言えないためnull（一覧には出さない。未評価件数は別途、
// 検索画面の「点検調書（防災）」集計から確認できる）。
export function karteResponseCategoryToTier(category: string | null | undefined): UnifiedTier | null {
  if (category === "COUNTERMEASURE_NEEDED") return "action_needed";
  if (category === "HANDLED_BY_KARTE") return "monitor";
  if (category === "NO_COUNTERMEASURE_NEEDED" || category === "COUNTERMEASURE_COMPLETED") return "no_action";
  return null;
}
