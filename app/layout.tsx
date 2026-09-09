import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "道路防災カルテ Web GIS (MVP)",
  description: "道路防災カルテ点検業務支援システム MVP",
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
      <body className="min-h-screen">
        <header className="flex items-center justify-between border-b border-gray-300 bg-white px-6 py-3 dark:border-gray-700 dark:bg-gray-900">
          <a href="/karte" className="text-lg font-bold text-gray-800 dark:text-gray-100">
            道路防災カルテ Web GIS{" "}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">MVP</span>
          </a>
          <nav className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <a href="/karte" className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
              検索・一覧
            </a>
            <ThemeToggle />
          </nav>
        </header>
        {/* 様式Ａ・様式Ｃ等はExcelを模した横に広い表になるため、幅を制限しすぎると
            本来不要な横スクロールが発生してしまう。画面の余白を活かせるよう
            十分に広い上限（max-w-[1800px]）にとどめている（無制限にはせず、
            超ワイドモニタでの間延びだけは防ぐ）。 */}
        <main className="mx-auto max-w-[1800px] p-6">{children}</main>
      </body>
    </html>
  );
}
