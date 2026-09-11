// Prisma enum → 日本語ラベルの対応表。
// 一覧・詳細・地図の各画面で表示がズレないよう、ここに一元化する
// （以前、一覧画面と詳細画面でRESPONSE_LABELの定義が別々になっていたのを統合した）。

export const KARTE_TYPE_LABEL: Record<string, string> = {
  ROCKFALL_COLLAPSE: "落石・崩壊",
  ROCK_MASS_COLLAPSE: "岩盤崩壊",
  LANDSLIDE: "地すべり",
  AVALANCHE: "雪崩",
  DEBRIS_FLOW: "土石流",
  EMBANKMENT: "盛土",
  RETAINING_WALL: "擁壁",
  BRIDGE_FOUNDATION_SCOUR: "橋梁基礎の洗掘",
  SNOWDRIFT: "地吹雪",
  OTHER: "その他",
};

// トンネル台帳等、カルテとは別枠の台帳の種別ラベル
// （prisma/schema.prismaのFacilityLedgerCategory参照。現状はトンネルのみ）。
export const FACILITY_LEDGER_CATEGORY_LABEL: Record<string, string> = {
  TUNNEL: "トンネル台帳",
};

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
