import type { RoadType } from "@prisma/client";
import type { RoadTypeGroupKey } from "@/lib/road-type-groups";

// 点検調書（防災＝Karte）の路線名の道路種別分類。
//
// 検索画面の路線名2段階絞り込み（道路種別→路線名）・一覧表示・詳細画面での
// 「（町）」等の記号表示のために使う。
//
// 【経緯】当初、Karteは施設台帳（FacilityListItem.routeType）のような信頼できる
// 道路種別データを持たないと考えており、利用者が/settingsで任意に道路種別を
// 割り当てる上書きテーブル（RouteRoadTypeOverride）を用意していた。しかし
// 実際に「未分類」だった路線を確認したところ全て県道だったことが判明し
// （会話ログ「先ほど分類されていなかったのは、すべて県道でした」参照）調査
// し直したところ、Karte自体に元々roadType列（Excel「Listシート」の道路種別。
// 全127件に設定済み。lib/labels.tsのROAD_TYPE_LABEL参照）という信頼できる
// 実データが既に存在していたことが判明した。手動分類・専用DB・コード内
// 固定データのいずれも不要だったため廃止し、施設台帳と同じ考え方
// （lib/road-type-groups.tsのgroupOfFacilityRouteType参照）でKarte.roadTypeから
// 機械的に判定する方式に一本化した（会話ログ「道路種別振り分け機能はなく
// してしまってください」参照）。
//
// 県道は、主要地方道（MAJOR_PREFECTURAL）／一般都道府県道（PREFECTURAL）で
// 表示記号を分ける（会話ログ「主要地方道を(主)、一般県道を(一)と表示する
// ようにしてください」参照）。それ以外は1段階目の道路種別ボタン（国道／県道／
// 市町村道／その他。lib/road-type-groups.tsのRoadTypeGroupKey）に素直に対応する
// 区分へ割り当てる。
const PREFIX: Record<RoadType, string> = {
  EXPRESSWAY: "（他）", // 高速自動車国道（現状データに存在しないが将来のため網羅）
  NATIONAL_DESIGNATED: "（国）", // 一般国道（指定区間）
  NATIONAL_UNDESIGNATED: "（国）", // 一般国道（指定区間外）
  MAJOR_PREFECTURAL: "（主）", // 主要地方道
  PREFECTURAL: "（一）", // 一般都道府県道
  MUNICIPAL_1: "（町）", // 市町村道（1級）
  MUNICIPAL_2: "（町）", // 市町村道（2級）
  MUNICIPAL_OTHER: "（町）", // 市町村道（その他）
  TOLL_ROAD: "（他）", // 一般有料道路
  URBAN_EXPRESSWAY: "（他）", // 都市高速道路
};

const GROUP: Record<RoadType, RoadTypeGroupKey> = {
  EXPRESSWAY: "other",
  NATIONAL_DESIGNATED: "national",
  NATIONAL_UNDESIGNATED: "national",
  MAJOR_PREFECTURAL: "prefectural",
  PREFECTURAL: "prefectural",
  MUNICIPAL_1: "municipal",
  MUNICIPAL_2: "municipal",
  MUNICIPAL_OTHER: "municipal",
  TOLL_ROAD: "other",
  URBAN_EXPRESSWAY: "other",
};

export function karteRouteGroup(roadType: RoadType | null | undefined): RoadTypeGroupKey | null {
  return roadType ? GROUP[roadType] : null;
}

// 一覧・詳細画面での表示用（路線名の前に道路種別の記号を付ける）。roadTypeが
// 無い場合（理論上はKarte.roadTypeが未設定の行のみ）は記号を付けずそのまま返す。
export function karteRouteDisplayName<T extends string | null | undefined>(
  routeName: T,
  roadType: RoadType | null | undefined
): T {
  if (!routeName || !roadType) return routeName;
  return (`${PREFIX[roadType]}${routeName}` as unknown) as T;
}
