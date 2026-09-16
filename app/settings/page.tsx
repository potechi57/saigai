import Link from "next/link";
import { getKarteRouteNameOptions, getRouteRoadTypeOverrides } from "@/lib/reference-data";
import { isRoadTypeGroupKey, roadTypeGroupLabel, roadTypeGroupPrefix, type RoadTypeGroupKey } from "@/lib/road-type-groups";
import RouteRoadTypeSelect from "@/components/RouteRoadTypeSelect";

export const dynamic = "force-dynamic";

// PC向けの設定画面（会話ログ「基本的な機能ではないので、設定画面などにあると
// よいかと思います」参照）。現状は「点検調書（防災）の路線名の道路種別」
// 手動設定のみを置く。他の設定が増えた場合もこのページに追加していく想定
// （/m/settingsはスマホ現場用画面専用のため別物のまま）。
//
// 【背景】点検調書（防災＝Karte）の路線名は、施設台帳のような信頼できる
// 道路種別データを持たない（路線名検索を道路種別＋路線名の2段階にする際に
// 施設台帳側の路線名と照合したが一致が0件だった）。「宮の原線のような、
// 道路種別が決まっていない路線を手動で分類したい」との要望を受け、
// RouteRoadTypeOverrideテーブルへの手動割り当てをここで行えるようにする。
// 一度設定すると、検索画面の路線名2段階絞り込み・一覧・カルテ詳細画面で
// 「（町）」のような記号付きで表示されるようになる（app/karte/page.tsx・
// app/karte/[karteNo]/page.tsx参照）。
export default async function SettingsPage() {
  const [routeNames, overrides] = await Promise.all([getKarteRouteNameOptions(), getRouteRoadTypeOverrides()]);

  const overrideMap = new Map<string, RoadTypeGroupKey>(
    overrides
      .filter((o) => isRoadTypeGroupKey(o.roadTypeGroup))
      .map((o) => [o.routeName, o.roadTypeGroup as RoadTypeGroupKey])
  );

  const rows = routeNames.map((routeName) => ({
    routeName,
    group: overrideMap.get(routeName) ?? null,
  }));
  const unclassifiedCount = rows.filter((r) => r.group === null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/karte" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 地図に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">設定</h1>

      <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            点検調書（防災）の路線名・道路種別
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            点検調書（防災）の路線名は、施設台帳のような道路種別（国道・県道・市町村道等）のデータを持っていないため、検索画面の「道路種別→路線名」の2段階絞り込みでは多くが「未分類」のままになります。ここで路線ごとに道路種別を手動で割り当てると、検索画面での絞り込み・一覧表示に反映され、路線名の前に
            <span className="font-mono">（町）</span>のような記号が付くようになります（管理番号や台帳の内容自体は変更しません）。
          </p>
          {unclassifiedCount > 0 && (
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-500">未分類の路線が{unclassifiedCount}件あります。</p>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 dark:text-gray-500">路線名を持つ点検調書（防災）がまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2">路線名</th>
                  <th className="px-4 py-2">道路種別</th>
                  <th className="px-4 py-2">表示例</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.routeName} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{r.routeName}</td>
                    <td className="px-4 py-2">
                      <RouteRoadTypeSelect routeName={r.routeName} initialGroup={r.group} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {r.group ? (
                        <>
                          {roadTypeGroupPrefix(r.group)}
                          {r.routeName}
                        </>
                      ) : (
                        `${roadTypeGroupLabel(null)}（記号なし）`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
