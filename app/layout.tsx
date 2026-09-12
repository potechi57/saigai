import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import ViewHistoryButton from "@/components/ViewHistoryButton";

export const metadata: Metadata = {
  title: "道路施設管理 Web GIS (MVP)",
  description: "道路施設の点検・台帳管理支援システム MVP",
};

// 保存済みのテーマ（またはOS設定）を、Reactの初回描画より前に<html>へ反映する。
// useEffect任せにすると一瞬ライトモードで表示されてからダークに切り替わる
// 「ちらつき」が起きるため、<head>内でブロッキング実行するインラインスクリプトにしている。
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
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
      </head>
      <body className="flex min-h-screen flex-col">
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
          <a href="/karte" className="truncate text-base font-bold text-gray-800 dark:text-gray-100 sm:text-lg">
            道路施設管理 Web GIS{" "}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">MVP</span>
          </a>
          {/* 「設定やらいろいろ」置き場。検索画面自体には検索条件パネルしか
              置かない方針にしたため、画面をまたいで常に使う操作はすべてここへ集約
              している。データの追加方法（Excel取込・台帳画像登録・手入力など）が
              複数存在するようになったため、それぞれを個別にヘッダーへ並べるのではなく
              「資料読み込み」1つのボタンにまとめ、遷移先（/import）で各手法を
              説明付きで案内する構成にしている。 */}
          {/* sm未満（スマホ幅）ではPC向けの補助的なリンク群を隠す。h-14固定の
              ヘッダーに全項目を詰め込むと折り返してヘッダーの実高さがずれ、
              /karteの地図がヘッダー分を引いた高さ計算からはみ出すため
              （スマホ側は/m以下の別画面を使う想定で、これらのリンクは元々不要）。 */}
          <nav className="hidden items-center gap-4 text-sm text-gray-600 dark:text-gray-300 sm:flex">
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
            <ThemeToggle />
          </nav>
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
