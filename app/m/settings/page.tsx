import ThemeToggle from "@/components/ThemeToggle";
import FontSizeToggle from "@/components/FontSizeToggle";
import NearbyRadiusSetting from "@/components/NearbyRadiusSetting";
import AppVersionSection from "@/components/AppVersionSection";
import BackLink from "@/components/BackLink";

// 現場向け画面（/m）の設定画面。
//
// 【背景・会話ログより】「スマホ用画面では、ダークモードライトモードの切り替えは
// 不要かもしれない。設定ボタンを追加して、そこで切り替えられるようにしてください」
// への対応から始まり、「ホーム位置の設定以外を追加してください」との指示で
// 現在地検索の半径変更・文字サイズの拡大・アプリの更新確認を追加した
// （ホーム位置の設定は提案のみで見送り）。
export default function MobileSettingsPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <BackLink fallbackHref="/m">
        ← 検索に戻る
      </BackLink>
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">⚙️ 設定</h1>

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">表示テーマ</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">屋外の明るさ等に応じて切り替えてください。</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">文字の大きさ</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">炎天下や老眼等で読みにくい場合に。</p>
          </div>
          <FontSizeToggle />
        </div>
      </section>

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">「現在地から探す」の範囲</p>
        <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
          都市部は狭め、山間部は広めなど、状況に応じて選んでください。
        </p>
        <NearbyRadiusSetting />
      </section>

      <section className="rounded border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">アプリの状態</p>
        <AppVersionSection />
      </section>
    </div>
  );
}
