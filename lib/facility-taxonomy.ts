// 島根県公共土木施設台帳の分類体系（会話ログ参照）。
// https://www.pref.shimane.lg.jp/infra/kouji/kouji_info/rokyuka/manual.html
//
// 検索・地図画面（app/karte/page.tsx。法令台帳タブ）と、台帳（画像）登録フォーム
// （components/FacilityLedgerForm.tsx）の両方で、同じ「分野→施設名称」の
// 分類（種別）を使うため、ここに1つだけ定義して共有する（以前はapp/karte/page.tsxに
// ローカル定義していたが、FacilityLedgerFormでも同じ分類を使うことになったため
// 切り出した。「種別に表示するのは分類そのままにしてほしい」という指示に基づき、
// このURLの分類をそのまま使う）。
export type FieldKey = string;
export type FieldDef = { key: FieldKey; label: string };
// 施設名称のmatchは、実データのfacilityType/facilitySubType文字列に対する
// 部分一致キーワード（いずれかを含めば該当）。matchが無いものは実データが無く
// 未検証のため、検索画面では選択すると「準備中」表示になる
// （app/karte/page.tsxのFieldDrilldown参照）。
export type FacilityTypeDef = { label: string; match?: string[] };

export const FACILITY_FIELDS: FieldDef[] = [
  { key: "road", label: "道路" },
  { key: "river_coast", label: "河川・海岸" },
  { key: "port", label: "港湾" },
  { key: "sabo", label: "砂防" },
  { key: "landslide_prevention", label: "地すべり防止区域" },
  { key: "park", label: "公園" },
  { key: "airport", label: "空港" },
  { key: "avalanche_prevention", label: "雪崩対策施設" },
  { key: "sediment_disaster_warning", label: "土砂災害予警報システム" },
];

export const FACILITY_TYPES: Record<FieldKey, FacilityTypeDef[]> = {
  road: [
    { label: "道路共通" },
    { label: "橋梁", match: ["橋"] },
    { label: "トンネル", match: ["トンネル"] },
    { label: "道路法面構造物", match: ["法面"] },
    { label: "舗装" },
    { label: "道路標識", match: ["標識"] },
    { label: "道路照明" },
    { label: "シェッド・シェルター" },
    { label: "大型カルバート" },
    { label: "道路情報提供装置" },
    { label: "電線共同溝" },
    { label: "冠水対策施設" },
    { label: "消融雪設備" },
    { label: "道の駅" },
  ],
  river_coast: [
    { label: "河川共通" },
    { label: "河川管理施設" },
    { label: "海岸共通" },
    { label: "海岸保全施設" },
    { label: "ダム施設" },
  ],
  port: [{ label: "港湾共通" }, { label: "港湾施設" }],
  sabo: [{ label: "砂防えん堤" }, { label: "渓流保全工" }, { label: "砂防河川共通" }],
  landslide_prevention: [{ label: "地すべり防止施設" }],
  park: [{ label: "都市公園" }],
  airport: [{ label: "空港施設" }],
  avalanche_prevention: [{ label: "雪崩対策施設" }],
  sediment_disaster_warning: [{ label: "土砂災害予警報システム" }],
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
