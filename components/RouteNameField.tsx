"use client";

import { useMemo, useState } from "react";
import { ROAD_TYPE_GROUPS, type RoadTypeGroupKey } from "@/lib/road-type-groups";

// 「路線名」を、道路種別→路線名の2段階で選べるようにする汎用コンポーネント
// （会話ログ「路線名検索を道路種別＋路線名の2段階にする」参照）。施設台帳タブ
// （facRouteName。道路種別は全路線が施設台帳自身のrouteTypeから判明済み）と
// 点検調書タブ（routeName。道路種別はKarte.roadTypeという実データから判明する。
// lib/karte-route-classification.ts参照）の両方で使うため、groupの判定方法・
// 表示用テキスト（displayName）の組み立て方は呼び出し側（app/karte/page.tsx）
// に任せ、このコンポーネントは「routeNameごとに解決済みのgroup・displayName」
// を受け取るだけにしている（施設台帳側の路線名は国道・主要地方道・一般県道で
// 既に「（国）」「（主）」「（一）」を含んでいるため、ここでさらに記号を付ける
// と二重になってしまう不具合があった。会話ログ「(県)(主)松江鹿島美保関線と
// 表示されてしまってます」参照。呼び出し側で二重にならないよう組み立て済みの
// 文字列をそのまま出す方式にした）。
//
// 最終的に送信するのは既存と同じ<select name={name}>なので、サーバー側の
// 検索処理・URLの形式は一切変えていない（既存の路線名検索との互換性を維持する）。
export type RouteGroupOption = { routeName: string; group: RoadTypeGroupKey | null; displayName: string };

type GroupSelection = RoadTypeGroupKey | "all" | "unclassified";

// 路線名の絞り込みは、実データの多く（例:「（国）４３２号」）が全角数字である
// 一方、利用者が半角数字で入力することも多いと考えられるため、比較の際だけ
// 半角英数字を全角に正規化する（入力値・route名そのものは変更しない。表示・
// 送信される値には一切影響しない、あくまで比較用の正規化）。
function toFullWidth(s: string): string {
  return s.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

export default function RouteNameField({
  name,
  routes,
  defaultValue,
  // 「未分類」グループのピルを出すかどうか。施設台帳タブは全路線の道路種別が
  // 判明しているため不要、点検調書タブは大半が未分類になりうるため表示する。
  showUnclassified = false,
  filterPlaceholder = "路線名を絞り込む",
}: {
  name: string;
  routes: RouteGroupOption[];
  defaultValue?: string;
  showUnclassified?: boolean;
  filterPlaceholder?: string;
}) {
  // 既に選択済みの路線名があれば、その路線が属する道路種別を初期表示する
  // （検索条件クリア直後・タブ切替直後等でどのグループを見ればよいか
  // 迷わないようにするため）。
  const initialGroup: GroupSelection = defaultValue
    ? (routes.find((r) => r.routeName === defaultValue)?.group ?? (showUnclassified ? "unclassified" : "all"))
    : "all";
  const [group, setGroup] = useState<GroupSelection>(initialGroup);
  const [filter, setFilter] = useState("");

  const filteredRoutes = useMemo(() => {
    const normalizedFilter = toFullWidth(filter);
    return routes
      .filter((r) => {
        if (group === "all") return true;
        if (group === "unclassified") return r.group === null;
        return r.group === group;
      })
      .filter((r) => !normalizedFilter || r.displayName.includes(normalizedFilter));
  }, [routes, group, filter]);

  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-gray-500 dark:text-gray-400">路線名</label>

      {/* 1段階目: 道路種別 */}
      <div className="flex flex-wrap gap-1">
        {(["all", ...ROAD_TYPE_GROUPS.map((g) => g.key), ...(showUnclassified ? (["unclassified"] as const) : [])] as GroupSelection[]).map(
          (key) => {
            const label = key === "all" ? "すべて" : key === "unclassified" ? "未分類" : ROAD_TYPE_GROUPS.find((g) => g.key === key)!.label;
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
          }
        )}
      </div>

      {/* 路線名自体の検索・絞り込み（会話ログ「路線名自体にも検索・絞り込み機能を
          設ける」参照）。ここに入力した文字列はフォーム送信されず、あくまで
          下の一覧を絞り込むためだけに使う。 */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={filterPlaceholder}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
      />

      {/* 2段階目: 路線名（実際に検索条件として送信されるのはこの値。送信値自体は
          道路種別プレフィックスを含まない元のroutName。表示上だけプレフィックスを
          付ける） */}
      <select
        key={defaultValue ?? ""}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">すべて</option>
        {filteredRoutes.map((r) => (
          <option key={r.routeName} value={r.routeName}>
            {r.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
