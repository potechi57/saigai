// 島根県公共土木施設台帳の分類体系（会話ログ参照）。
// https://www.pref.shimane.lg.jp/infra/kouji/kouji_info/rokyuka/manual.html
//
// このページには【法令台帳一覧】【施設台帳一覧】【点検調書一覧】という3つの表が
// 別々にあり、それぞれ分野・施設名称の内訳が異なる（同じ「河川・海岸」という
// 分野名でも、法令台帳では「海岸共通」、施設台帳では「ダム施設」というように、
// 属する施設名称が違う）。以前はこの3つを混同し、法令台帳の分類に施設台帳の
// 項目（施設台帳の道路14種別・ダム施設等）を混ぜてしまっていたため、本来
// 法令台帳「港湾」に存在するはずの「海岸共通」が選べない等の不具合になっていた
// （会話ログ「法令台帳の港湾の項目の中に、海岸共通などが入っていません...
// 法令台帳と施設台帳がごっちゃになっていますね」参照）。3つの表それぞれの内容を
// 個別に転記し、混ぜないようにする。
//
// FACILITY_FIELDS/TYPES＝【法令台帳一覧】、FACILITY_LEDGER_ITEM_FIELDS/TYPES＝
// 【施設台帳一覧】。【点検調書一覧】はapp/karte/page.tsxのINSPECTION_FIELDS/TYPES
// （災害＝カルテ点検はこのページの表に無いアプリ独自の拡張のため、あちらにのみ
// ローカル定義している）。
//
// 検索・地図画面（app/karte/page.tsx）と、台帳（画像）登録フォーム
// （components/FacilityLedgerForm.tsx。分類（法令台帳／施設台帳）に応じて
// FACILITY_FIELDS/TYPESとFACILITY_LEDGER_ITEM_FIELDS/TYPESを切り替える）、
// 台帳登録画面の「施設台帳から選んで自動入力」ピッカー（app/ledgers/new/page.tsx。
// 常にFACILITY_LEDGER_ITEM_FIELDS/TYPESを使う＝施設台帳から選ぶため）で共有する。
export type FieldKey = string;
export type FieldDef = { key: FieldKey; label: string };
// 施設名称のmatchは、実データのfacilityType/facilitySubType文字列に対する
// 部分一致キーワード（いずれかを含めば該当）。matchが無いものは実データが無く
// 未検証のため、検索画面では選択すると「準備中」表示になる
// （app/karte/page.tsxのFieldDrilldown参照）。
export type FacilityTypeDef = { label: string; match?: string[] };

// 【法令台帳一覧】（Shimaneのページの表をそのまま転記。台帳様式が複数あっても
// 施設名称が同じ行はまとめている）。
export const FACILITY_FIELDS: FieldDef[] = [
  { key: "road", label: "道路" },
  { key: "river_coast", label: "河川・海岸" },
  { key: "port", label: "港湾" },
  { key: "sabo", label: "砂防" },
  { key: "park", label: "公園" },
];

export const FACILITY_TYPES: Record<FieldKey, FacilityTypeDef[]> = {
  road: [{ label: "道路共通" }, { label: "橋梁", match: ["橋"] }, { label: "トンネル", match: ["トンネル"] }],
  river_coast: [{ label: "河川共通" }, { label: "河川管理施設" }, { label: "海岸共通" }],
  // 「海岸共通」「海岸保全施設」は河川・海岸だけでなく港湾にも存在する
  // （Shimaneの表では港湾分野に「海岸保全区域台帳」「海岸保全施設調書」という
  // 別の台帳様式として載っている。会話ログの指摘どおり）。
  port: [{ label: "港湾共通" }, { label: "港湾施設" }, { label: "海岸共通" }, { label: "海岸保全施設" }],
  sabo: [{ label: "砂防河川共通" }, { label: "砂防指定地台帳" }, { label: "地すべり防止区域" }],
  park: [{ label: "都市公園" }],
};

// 【施設台帳一覧】（施設台帳タブ・台帳（画像）登録の「施設台帳から選んで
// 自動入力」ピッカーで使う）。Shimaneのページの表をそのまま転記。
export const FACILITY_LEDGER_ITEM_FIELDS: FieldDef[] = [
  { key: "road", label: "道路" },
  { key: "river_coast", label: "河川・海岸" },
  { key: "airport", label: "空港" },
  { key: "sabo", label: "砂防" },
];
export const FACILITY_LEDGER_ITEM_TYPES: Record<FieldKey, FacilityTypeDef[]> = {
  road: [
    { label: "橋梁", match: ["橋"] },
    { label: "トンネル", match: ["トンネル"] },
    { label: "道路法面構造物", match: ["法面"] },
    { label: "舗装" },
    { label: "道路標識", match: ["標識"] },
    { label: "道路照明" },
    { label: "シェッド・シェルター" },
    { label: "大型カルバート" },
    { label: "道路情報提供装置" },
    { label: "道路情報システム施設" },
    { label: "電線共同溝" },
    { label: "冠水対策施設" },
    { label: "消融雪設備" },
    { label: "道の駅" },
  ],
  // 「ダム施設」は施設台帳のみに存在する（法令台帳の河川・海岸には存在しない。
  // 会話ログ「河川・海岸の中にダム施設が入っていたりと」参照。以前はこれを
  // 誤って法令台帳側にも入れてしまっていた）。
  river_coast: [{ label: "河川管理施設" }, { label: "ダム施設" }],
  airport: [{ label: "空港施設" }],
  sabo: [
    { label: "砂防えん堤" },
    { label: "渓流保全工" },
    { label: "砂防河川共通" },
    { label: "地すべり防止区域" },
    { label: "急傾斜地崩壊防止区域" },
    { label: "雪崩対策施設" },
    { label: "土砂災害予警報システム" },
  ],
};

// 分野・施設名称（自由記述文字列）から、直感的に分かる絵文字を選ぶ。
// components/MapView.tsxのfacilityIconEmoji（FacilityListItem用）と同じ考え方を、
// FacilityLedger（台帳画像）にも使う。
export function facilityTaxonomyEmoji(facilityType: string | null | undefined, facilitySubType: string | null | undefined): string {
  const text = `${facilityType ?? ""} ${facilitySubType ?? ""}`;
  if (text.includes("橋")) return "🌉";
  if (text.includes("トンネル")) return "🚇";
  if (text.includes("標識")) return "🪧";
  if (text.includes("法面")) return "⛰️";
  return "🛣️";
}
