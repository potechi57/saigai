import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// 現場向け画面（/m）の設定画面。
//
// 【背景・会話ログより】「スマホ用画面では、ダークモードライトモードの切り替えは
// 不要かもしれない。設定ボタンを追加して、そこで切り替えられるようにしてください」
// への対応。従来ヘッダーに直接置いていたライト/ダーク切替（ThemeToggle）を
// ここに移した。ThemeToggleコンポーネント自体はPC側ヘッダーとも共通のものを
// そのまま再利用している（見た目・挙動を変える必要が無いため）。
//
// 現時点では設定項目がライト/ダーク切替の1つだけだが、今後の追加を見越して
// 独立したページにしている（会話ログで他の設定候補についても相談中）。
export default function MobileSettingsPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Link href="/m" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← 検索に戻る
      </Link>
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
    </div>
  );
}
