import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import ViewHistoryButton from "@/components/ViewHistoryButton";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import HeaderHomeLink from "@/components/HeaderHomeLink";

export const metadata: Metadata = {
  title: "道路施設管理 Web GIS (MVP)",
  description: "道路施設の点検・台帳管理支援システム MVP",
  // app/manifest.tsを参照させ、スマホのホーム画面に追加できるようにする
  // （優先事項10「現場（スマホ）向け画面の本格実装」Phase 5）。
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "道路施設管理" },
};

// スマホのステータスバー・タスク切替画面のアクセントカラー（theme-color）。
//
// 【不具合修正・会話ログより】「設定ボタンを押した瞬間にライトモードに切り替わる」
// との報告があり調査した。以前はここをprefers-color-scheme（OS側の設定）だけで
// 出し分けていたが、それとThemeToggleでの手動切替（localStorage「theme」）は
// 別物のため、「OSはライト設定だが、アプリ内では手動でダークモードを選んでいる」
// 場合に、ページの中身はダークのままでも、ブラウザ/PWA側のステータスバー・
// アドレスバーの色（theme-color）だけがライト側に戻ってしまう不整合があった。
// ページ遷移のたびにtheme-colorがOS設定に基づいて再評価されるため、
// 「ボタンを押した瞬間に」チラつく・切り替わって見えるように感じられたと考えられる。
// ここでは静的な既定値（JS未実行時点の初期表示用）だけを置き、実際の値は
// 手動選択を優先してTHEME_INIT_SCRIPT・ThemeToggle.tsxがJSで直接
// <meta name="theme-color">を書き換える方式に変更した。
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

// 保存済みのテーマ（またはOS設定）を、Reactの初回描画より前に<html>へ反映する。
// useEffect任せにすると一瞬ライトモードで表示されてからダークに切り替わる
// 「ちらつき」が起きるため、<head>内でブロッキング実行するインラインスクリプトにしている。
// theme-colorの2値はcomponents/ThemeToggle.tsxのtoggle()内と一致させること
// （手動切替時もここと同じ値でmetaタグを書き換えるため）。
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#1f2937" : "#ffffff");
  } catch (e) {}
})();
`;

// 文字サイズ設定（components/FontSizeToggle.tsx）も、テーマ同様に初回描画前へ
// ブロッキング適用する（useEffect任せだと一瞬標準サイズで表示されてから
// 大きくなる「ちらつき」＝レイアウトシフトが起きるため）。
const FONT_SIZE_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("mobileLargeText") === "1") {
      document.documentElement.classList.add("large-text");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: FONT_SIZE_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <ServiceWorkerRegister />
        {/* h-14固定にしているのは、地図中心の検索画面（app/karte/page.tsx）が
            ヘッダー分を差し引いた高さ(h-[calc(100vh-3.5rem)])で地図を敷き詰めるため、
            ヘッダーの実高さを正確に把握できる必要があるため（曖昧なpy-*任せにすると
            ずれて二重スクロールが発生する）。
            relative z-[2000]は、地図（components/MapView.tsxの凡例・現在地ボタン等の
            オーバーレイがz-[1000]）より必ず手前に描画されるようにするため。無いと、
            ヘッダー内の閲覧履歴ドロップダウンが地図の裏に隠れてしまう
            （ヘッダー自身がスタッキングコンテキストを作っていないと、子要素の
            z-indexだけ上げても地図側のz-[1000]には勝てないため、ヘッダー自体に
            地図より大きいz-indexを与える必要がある）。 */}
        <header className="relative z-[2000] flex h-14 shrink-0 items-center justify-between border-b border-gray-300 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
          <HeaderHomeLink />
          {/* 「設定やらいろいろ」置き場。検索画面自体には検索条件パネルしか
              置かない方針にしたため、画面をまたいで常に使う操作はすべてここへ集約
              している。データの追加方法（Excel取込・台帳画像登録・手入力など）が
              複数存在するようになったため、それぞれを個別にヘッダーへ並べるのではなく
              「資料読み込み」1つのボタンにまとめ、遷移先（/import）で各手法を
              説明付きで案内する構成にしている。 */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 sm:gap-4">
            {/* sm未満（スマホ幅）ではPC向けの補助的なリンク群を隠す。h-14固定の
                ヘッダーに全項目を詰め込むと折り返してヘッダーの実高さがずれ、
                /karteの地図がヘッダー分を引いた高さ計算からはみ出すため
                （スマホ側は/m以下の別画面を使う想定で、これらのリンクは元々不要）。 */}
            {/* sm未満（スマホ幅）でのみ表示する、現場向け簡易画面（/m）への入口。
                PC幅では/karte以下がメインのため不要（優先事項10 Phase 5）。 */}
            <a
              href="/m"
              className="sm:hidden shrink-0 whitespace-nowrap rounded bg-gray-800 px-2 py-1.5 text-xs text-white dark:bg-gray-700"
            >
              📱 現場用
            </a>
            {/* お気に入り・閲覧履歴も、スマホ幅では上記と同じ理由でPC向けnavごと
                隠れてしまっていたが、会話ログ「ヘッダーにお気に入り・閲覧履歴が
                あると、一度戻ってしまった際にすぐに戻れてよい」との要望を受け、
                スマホ幅専用にアイコンのみのコンパクト版を追加した（文字入りだと
                他の項目と合わせて折り返してしまうため）。リンク先は/karte/favorites
                ではなく/m/favoritesにする（PC向け画面は崩れるため）。 */}
            <a
              href="/m/favorites"
              aria-label="お気に入り"
              className="sm:hidden shrink-0 text-base text-gray-600 dark:text-gray-300"
            >
              ★
            </a>
            <span className="sm:hidden">
              <ViewHistoryButton compact />
            </span>
            {/* 会話ログ「スマホ用画面では、ダークモードライトモードの切り替えは
                不要かもしれない。設定ボタンを追加して、そこで切り替えられるように
                してください」より、スマホ幅ではライト/ダーク切替をヘッダー直接では
                なく設定画面（/m/settings）にまとめた。PC幅は従来通りThemeToggleを
                直接ヘッダーに置く（下記参照）。 */}
            <a
              href="/m/settings"
              aria-label="設定"
              className="sm:hidden shrink-0 text-base text-gray-600 dark:text-gray-300"
            >
              ⚙️
            </a>
            <nav className="hidden items-center gap-4 sm:flex">
              <a href="/karte/favorites" className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
                ★ お気に入り
              </a>
              <a href="/karte/history" className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
                編集履歴
              </a>
              <ViewHistoryButton />
              <a
                href="/import"
                className="rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                ＋ 資料読み込み
              </a>
            </nav>
            <span className="hidden sm:inline-block">
              <ThemeToggle />
            </span>
          </div>
        </header>
        {/* 幅・余白の決め方はページごとに任せる（mainには一律のpaddingを付けない）。
            地図中心の検索画面はヘッダー直下を隙間なく使いたいため何も足さず、
            それ以外のページは自身のトップレベル要素にp-6を指定して余白を作る
            （様式Ａ等の横に広い表を持つカルテ詳細画面のように、幅の上限
            （max-w-[1800px]等）も含めて各ページが自分で決める）。 */}
        <main className="min-h-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
