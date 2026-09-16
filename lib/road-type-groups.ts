// 路線名を道路種別（国道／県道／市町村道／その他）で2段階検索するための
// 共通定義（会話ログ「路線名検索を道路種別＋路線名の2段階にする」参照）。
//
// 2つの別々の分類元がある:
//   - 施設台帳（FacilityListItem.routeType）: 実データの信頼できる値
//     （国道・主要地方道・一般県道・1級/2級町道・その他市道/町道）から
//     groupOfFacilityRouteTypeで機械的に判定する。
//   - 点検調書（防災＝Karte）: 道路種別を示す列が無く、施設台帳側の路線名と
//     照合しても一致が無かったため（会話ログで確認済み）、
//     RouteRoadTypeOverride（利用者が/settingsで手動設定する上書きテーブル）
//     の値のみを使う。自動判定・推測はしない。
//
// prefixは、道路種別が分かっている路線名の表示に付ける記号（会話ログ
// 「名前の前にも(町)のようにつけるようにしたいです」参照。法令台帳の実データ
// （（一）／（主）／（国）等）に倣った書式）。施設台帳側は「路線種別」欄に
// 実データをそのまま別表示しているため、この記号は付けない（付けるのは
// 点検調書＝Karteの路線名のみ）。
export type RoadTypeGroupKey = "national" | "prefectural" | "municipal" | "other";

export const ROAD_TYPE_GROUPS: { key: RoadTypeGroupKey; label: string; prefix: string }[] = [
  { key: "national", label: "国道", prefix: "（国）" },
  { key: "prefectural", label: "県道", prefix: "（県）" },
  { key: "municipal", label: "市町村道", prefix: "（町）" },
  { key: "other", label: "その他", prefix: "（他）" },
];

const GROUP_LABEL: Record<RoadTypeGroupKey, string> = Object.fromEntries(
  ROAD_TYPE_GROUPS.map((g) => [g.key, g.label])
) as Record<RoadTypeGroupKey, string>;
const GROUP_PREFIX: Record<RoadTypeGroupKey, string> = Object.fromEntries(
  ROAD_TYPE_GROUPS.map((g) => [g.key, g.prefix])
) as Record<RoadTypeGroupKey, string>;

export function isRoadTypeGroupKey(value: string): value is RoadTypeGroupKey {
  return ROAD_TYPE_GROUPS.some((g) => g.key === value);
}

export function roadTypeGroupLabel(key: RoadTypeGroupKey | null | undefined): string {
  return key ? GROUP_LABEL[key] : "未分類";
}

export function roadTypeGroupPrefix(key: RoadTypeGroupKey | null | undefined): string {
  return key ? GROUP_PREFIX[key] : "";
}

// 施設台帳（FacilityListItem.routeType）の実データ値からグループを判定する
// （道路法上の標準的な下位分類をそのまま束ねるだけで、推測は行わない。
// 会話ログでの調査・合意に基づく）。
export function groupOfFacilityRouteType(routeType: string | null | undefined): RoadTypeGroupKey {
  if (routeType === "国道") return "national";
  if (routeType === "主要地方道" || routeType === "一般県道") return "prefectural";
  if (routeType && (routeType.includes("町道") || routeType.includes("市道"))) return "municipal";
  return "other";
}
