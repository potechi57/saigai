"use client";

import { useMemo, useState } from "react";

// 施設台帳タブの「路線名」を、道路種別→路線名の2段階で選べるようにする
// （会話ログ「路線名検索を道路種別＋路線名の2段階にする」参照）。
//
// 【道路種別の根拠について】FacilityListItem.routeTypeは実データ由来の値
// （国道・主要地方道・一般県道・1級町道・2級町道・その他市道・その他町道）を
// 持っており、これは道路法上の正式な道路区分（国道／都道府県道／市町村道の
// 標準的な下位分類）をそのまま表しているため、推測ではなく実データに基づく
// 分類として「国道」「県道（主要地方道・一般県道）」「市町村道（1級／2級／
// その他市道／その他町道）」の3グループにまとめている。この分類根拠を持たない
// 点検調書（災害＝Karte）・法令台帳（FacilityLedger）の路線名は対象外のまま
// （2段階化していない）。
//
// 最終的に送信するのは既存と同じ<select name="facRouteName">なので、
// サーバー側の検索処理・URLの形式は一切変えていない（既存の路線名検索との
// 互換性を維持する、という要件に対応）。
export type RouteOption = { routeName: string; routeType: string | null };

const ROAD_TYPE_GROUPS = [
  { key: "national", label: "国道" },
  { key: "prefectural", label: "県道" },
  { key: "municipal", label: "市町村道" },
  { key: "other", label: "その他" },
] as const;
type GroupKey = (typeof ROAD_TYPE_GROUPS)[number]["key"] | "all";

// 路線名の絞り込みは、実データの多く（例:「（国）４３２号」）が全角数字である
// 一方、利用者が半角数字で入力することも多いと考えられるため、比較の際だけ
// 半角英数字を全角に正規化する（入力値・route名そのものは変更しない。表示・
// 送信される値には一切影響しない、あくまで比較用の正規化）。
function toFullWidth(s: string): string {
  return s.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

function groupOf(routeType: string | null): (typeof ROAD_TYPE_GROUPS)[number]["key"] {
  if (routeType === "国道") return "national";
  if (routeType === "主要地方道" || routeType === "一般県道") return "prefectural";
  if (routeType && (routeType.includes("町道") || routeType.includes("市道"))) return "municipal";
  return "other";
}

export default function FacilityRouteNameField({
  routes,
  defaultValue,
}: {
  routes: RouteOption[];
  defaultValue?: string;
}) {
  // 既に選択済みの路線名があれば、その路線が属する道路種別を初期表示する
  // （検索条件クリア直後・タブ切替直後等でどのグループを見ればよいか
  // 迷わないようにするため）。
  const initialGroup: GroupKey = defaultValue
    ? groupOf(routes.find((r) => r.routeName === defaultValue)?.routeType ?? null)
    : "all";
  const [group, setGroup] = useState<GroupKey>(initialGroup);
  const [filter, setFilter] = useState("");

  const filteredRoutes = useMemo(() => {
    const normalizedFilter = toFullWidth(filter);
    return routes
      .filter((r) => group === "all" || groupOf(r.routeType) === group)
      .filter((r) => !normalizedFilter || r.routeName.includes(normalizedFilter));
  }, [routes, group, filter]);

  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-gray-500 dark:text-gray-400">路線名</label>

      {/* 1段階目: 道路種別 */}
      <div className="flex flex-wrap gap-1">
        {(["all", ...ROAD_TYPE_GROUPS.map((g) => g.key)] as GroupKey[]).map((key) => {
          const label = key === "all" ? "すべて" : ROAD_TYPE_GROUPS.find((g) => g.key === key)!.label;
          const isActive = group === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setGroup(key)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                isActive
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500"
                  : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 路線名自体の検索・絞り込み（会話ログ「路線名自体にも検索・絞り込み機能を
          設ける」参照）。ここに入力した文字列はフォーム送信されず、あくまで
          下の一覧を絞り込むためだけに使う。 */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="路線名を絞り込む（例：国道9号）"
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
      />

      {/* 2段階目: 路線名（実際に検索条件として送信されるのはこの値） */}
      <select
        key={defaultValue ?? ""}
        name="facRouteName"
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">すべて</option>
        {filteredRoutes.map((r) => (
          <option key={r.routeName} value={r.routeName}>
            {r.routeName}
          </option>
        ))}
      </select>
    </div>
  );
}
