import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getKarteRouteNameOptions, getRouteRoadTypeOverrides } from "@/lib/reference-data";
import { isRoadTypeGroupKey, roadTypeGroupLabel, roadTypeGroupPrefix, type RoadTypeGroupKey } from "@/lib/road-type-groups";
import RouteRoadTypeSelect from "@/components/RouteRoadTypeSelect";
import HomeLocationSettings from "@/components/HomeLocationSettings";
import ThemeToggle from "@/components/ThemeToggle";
import type { HomeLocation } from "@/components/MapLoader";

export const dynamic = "force-dynamic";

// PC向けの設定画面（会話ログ「基本的な機能ではないので、設定画面などにあると
// よいかと思います」「ホーム位置の設定やダークモードなどの設定も設定に加えて
// ください」参照）。従来ヘッダーに個別に置いていたホーム位置・表示テーマの
// 設定と、点検調書（防災）の路線名・道路種別の手動設定をここに集約する
// （/m/settingsはスマホ現場用画面専用のため別物のまま）。表示テーマは
// 会話ログの経緯で元々PC幅ではヘッダーにも残す方針だったため、こちらは
// ヘッダーからは外さず両方に置く（そのままでもいつでも切り替えられる方が
// 便利なため）。
export default async function SettingsPage() {
  const [routeNames, overrides, appSettings] = await Promise.all([
    getKarteRouteNameOptions(),
    getRouteRoadTypeOverrides(),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const home: HomeLocation =
    appSettings?.homeLatitude != null && appSettings?.homeLongitude != null
      ? {
          latitude: Number(appSettings.homeLatitude),
          longitude: Number(appSettings.homeLongitude),
          label: appSettings.homeLabel,
        }
      : null;

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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">表示テーマ</h2>
        </div>
        <div className="p-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">ホーム位置</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            県土整備事務所等、点検の起点となる拠点の位置です。地図上の現在地・お気に入り等からの距離表示に使われます（事務所で1つを共有します）。
          </p>
        </div>
        <div className="p-4">
          <HomeLocationSettings home={home} />
        </div>
      </section>

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

      {/* 会話ログ「今はないですが、ヘルプなどもここですね」参照。ヘルプ自体は
          まだ存在しないため、今回は将来ここに置く場所だけを示す枠にとどめる
          （中身が無いまま作り込みすぎない方針。他の未実装の分類・組み合わせで
          「準備中」表示にとどめている箇所（例: app/import/page.tsx）と同じ考え方）。 */}
      <section className="rounded border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">ヘルプ</h2>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">準備中です。操作方法の説明等は今後ここに追加予定です。</p>
        </div>
      </section>
    </div>
  );
}
