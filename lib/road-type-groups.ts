// 路線名を道路種別（国道／県道／市町村道／その他）で2段階検索するための
// 共通定義（会話ログ「路線名検索を道路種別＋路線名の2段階にする」参照）。
//
// 2つの別々の分類元がある:
//   - 施設台帳（FacilityListItem.routeType）: 実データの信頼できる値
//     （国道・主要地方道・一般県道・1級/2級町道・その他市道/町道）から
//     groupOfFacilityRouteTypeで機械的に判定する。
//   - 点検調書（防災＝Karte）: Karte.roadType（Excel「Listシート」由来の実データ。
//     lib/karte-route-classification.ts参照）から機械的に判定する
//     （以前は/settingsで利用者が手動設定するDB上書きテーブルだったが、
//     未分類だった路線が全て県道だったことが判明し調査し直したところ、実は
//     Karte.roadTypeという信頼できる実データが既に存在していたため、専用の
//     設定画面・上書きテーブルは廃止した。会話ログ「道路種別振り分け機能は
//     なくしてしまってください」参照）。推測はしない。
//
// prefixは、道路種別が分かっている路線名の表示に付ける記号（会話ログ
// 「名前の前にも(町)のようにつけるようにしたいです」参照。法令台帳の実データ
// （（一）／（主）／（国）等）に倣った書式）。国道・主要地方道・一般県道の
// 場合、施設台帳側のrouteName自体に既にこの記号が含まれているため、
// 二重に付けないよう注意する（下記facilityRouteDisplayName参照）。
import { parseRouteName } from "@/lib/route-name";

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

// 施設台帳（FacilityListItem）の路線名の表示用テキストを組み立てる。
//
// 実データを確認したところ、routeTypeが「国道」「主要地方道」「一般県道」の
// 場合、routeName自体に既に「（国）４８５号」「（主）松江鹿島美保関線」
// 「（一）浜乃木湯町線」のように正式な前置き記号が含まれている（lib/route-name.ts
// が扱う表記と同じ形式）。そのため、ここでさらにgroup由来の記号
// （roadTypeGroupPrefix）を足すと「（県）（主）松江鹿島美保関線」のように
// 二重になってしまう（実際に発生していた不具合。会話ログ「(県)(主)松江鹿島
// 美保関線と表示されてしまってます」参照）。
// 既に前置き記号を含む路線名はそのまま使い、含まない路線名（町道・市道・
// その他。実データ上はこれらだけ前置き無しの素のまま格納されている）だけ
// group由来の記号を付ける。
export function facilityRouteDisplayName(routeName: string, group: RoadTypeGroupKey | null): string {
  if (parseRouteName(routeName).prefix) return routeName;
  return `${roadTypeGroupPrefix(group)}${routeName}`;
}
