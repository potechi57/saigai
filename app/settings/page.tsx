import { prisma } from "@/lib/prisma";
import HomeLocationSettings from "@/components/HomeLocationSettings";
import ThemeToggle from "@/components/ThemeToggle";
import type { HomeLocation } from "@/components/MapLoader";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// PC向けの設定画面（会話ログ「基本的な機能ではないので、設定画面などにあると
// よいかと思います」「ホーム位置の設定やダークモードなどの設定も設定に加えて
// ください」参照）。従来ヘッダーに個別に置いていたホーム位置・表示テーマの
// 設定をここに集約する（/m/settingsはスマホ現場用画面専用のため別物のまま）。
//
// 点検調書（防災）の路線名・道路種別の手動設定画面は、以前ここにあったが
// 廃止した。未分類だった路線を確認したところ全て島根県道だったことが判明し
// （会話ログ「先ほど分類されていなかったのは、すべて県道でした」参照）調査し
// 直したところ、Karte自体に元々roadType列（Excel「Listシート」の道路種別。
// 全件に設定済み）という信頼できる実データが既に存在していたため、手動設定
// 自体が不要だった。現在は lib/karte-route-classification.ts がKarte.roadType
// から機械的に判定する（施設台帳＝FacilityListItem.routeTypeと同じ方式）。
export default async function SettingsPage() {
  const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  const home: HomeLocation =
    appSettings?.homeLatitude != null && appSettings?.homeLongitude != null
      ? {
          latitude: Number(appSettings.homeLatitude),
          longitude: Number(appSettings.homeLongitude),
          label: appSettings.homeLabel,
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <BackLink fallbackHref="/karte">
        ← 地図に戻る
      </BackLink>
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
