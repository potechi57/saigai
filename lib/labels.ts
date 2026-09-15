// Prisma enum → 日本語ラベルの対応表。
// 一覧・詳細・地図の各画面で表示がズレないよう、ここに一元化する
// （以前、一覧画面と詳細画面でRESPONSE_LABELの定義が別々になっていたのを統合した）。

export const KARTE_TYPE_LABEL: Record<string, string> = {
  ROCKFALL_COLLAPSE: "落石・崩壊",
  EMBANKMENT: "盛土",
  RETAINING_WALL: "擁壁",
  BRIDGE_FOUNDATION_SCOUR: "橋梁基礎の洗掘",
  SNOWDRIFT: "地吹雪",
  OTHER: "その他",
};

// トンネル台帳等、カルテとは別枠の台帳（画像のみ）が、法令台帳・施設台帳の
// どちらに属するかのラベル（prisma/schema.prismaのFacilityLedgerDocClass参照）。
// 種別（分野・施設名称）自体はコード化していないため、lib/labels.tsでのラベル
// 変換は不要（lib/facility-taxonomy.tsのlabelをそのまま表示に使う）。
export const FACILITY_LEDGER_DOC_CLASS_LABEL: Record<string, string> = {
  LEGAL: "法令台帳",
  FACILITY: "施設台帳",
};

// 台帳（画像。FacilityLedger）の表示名。Excelのような構造化データの裏付けが
// 無いまま登録されることが多く、管理番号が分かっていない・そもそも採番されて
// いない施設も存在するため、管理番号（managementNo）が無い場合は台帳名
// （name。例:「魚瀬トンネル」）で代用する（会話ログ「管理番号がなくても、
// 施設名で表示できるように」参照）。どちらも無い場合のみプレースホルダにする。
export function facilityLedgerDisplayName(managementNo?: string | null, name?: string | null): string {
  return managementNo || name || "（名称未設定）";
}

// 施設一覧（FacilityListItem）の施設種別表示。原本の「施設種別」列は、门型標識等の
// 道路附属物では「道路付属物」のように大分類止まりで、具体的な種類（例:「道路標識
// （门型）」）は「施設細別」列の方に入っている。施設種別だけでは何の施設か分からない
// ケースがあるため、施設細別があれば併記する（例:「道路付属物（道路標識（门型））」）。
// 施設細別が無い場合（法面施設等）は、施設種別のみをそのまま表示する。
export function formatFacilityType(facilityType?: string | null, facilitySubType?: string | null): string | null {
  // 実データでは、施設細別が施設種別と同じ値になっている行（法面施設等）があり、
  // その場合に併記すると「道路法面施設（道路法面施設）」のような冗長な表示になる
  // ため、値が異なる場合のみ併記する。
  if (facilitySubType && facilitySubType !== facilityType) {
    return facilityType ? `${facilityType}（${facilitySubType}）` : facilitySubType;
  }
  return facilityType ?? facilitySubType ?? null;
}

export const WEATHER_LABEL: Record<string, string> = {
  SUNNY: "晴",
  CLOUDY: "曇",
  RAIN: "雨",
  SNOW: "雪",
};

export const ROAD_TYPE_LABEL: Record<string, string> = {
  EXPRESSWAY: "高速自動車国道",
  NATIONAL_DESIGNATED: "一般国道（指定区間）",
  NATIONAL_UNDESIGNATED: "一般国道（指定区間外）",
  MAJOR_PREFECTURAL: "主要地方道",
  PREFECTURAL: "一般都道府県道",
  MUNICIPAL_1: "市町村道（1級）",
  MUNICIPAL_2: "市町村道（2級）",
  MUNICIPAL_OTHER: "市町村道（その他）",
  TOLL_ROAD: "一般有料道路",
  URBAN_EXPRESSWAY: "都市高速道路",
};

// 対応区分のメタ情報。地図マーカーは色だけに依存しないUIにするため（指示書7章）、
// 色に加えて短い記号（mark）も持たせ、マーカー内のテキストとして表示する。
export const RESPONSE_META: Record<string, { label: string; color: string; badgeColor: string; mark: string }> = {
  UNEVALUATED: {
    label: "未評価",
    color: "#9ca3af",
    badgeColor: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    mark: "・",
  },
  COUNTERMEASURE_NEEDED: {
    label: "対策工が必要",
    color: "#dc2626",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    mark: "急",
  },
  HANDLED_BY_KARTE: {
    label: "カルテ対応",
    color: "#d97706",
    badgeColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    mark: "注",
  },
  NO_COUNTERMEASURE_NEEDED: {
    label: "対策不要",
    color: "#16a34a",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    mark: "良",
  },
  COUNTERMEASURE_COMPLETED: {
    label: "対策完了",
    color: "#2563eb",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    mark: "済",
  },
};

export function responseMeta(category: string) {
  return RESPONSE_META[category] ?? RESPONSE_META.UNEVALUATED;
}

// 写真の由来様式（prisma/schema.prismaのPhotoSourceForm参照）。
// 現場向け画面（/m/[facilityNo]）で、様式ごとにタブ分けして表示するために使う
// （会話ログ「様式A,B,Cのような分類は分かるようにしてくれませんか」参照）。
export const PHOTO_SOURCE_FORM_LABEL: Record<string, string> = {
  FORM_A: "様式A（位置図）",
  FORM_B: "様式B（詳細）",
  FORM_D: "様式D（平面図等）",
  GENERAL_RECORD: "現状記録写真",
  OTHER: "その他",
};
