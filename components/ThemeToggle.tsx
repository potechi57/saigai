"use client";

import { useEffect, useState } from "react";

// ダークモード切替ボタン。実際の判定・適用はapp/layout.tsxの<html>クラス操作と
// インラインスクリプト（初回描画前にlocalStorage/OS設定を見て<html>にdarkクラスを
// 付ける。ちらつき防止のため）が担う。このコンポーネントはその状態を反映・トグルするだけ。
//
// 【不具合修正・会話ログより】「設定ボタンを押した瞬間にライトモードに切り替わる」
// 調査の結果、theme-color（スマホのステータスバー等の色）がOS設定
// （prefers-color-scheme）だけを見ており、ここでの手動選択を反映していなかった
// ことが原因と判明。app/layout.tsxのTHEME_INIT_SCRIPTと同じ値で、手動切替時にも
// <meta name="theme-color">を直接書き換えるようにした（詳細はTHEME_INIT_SCRIPTの
// コメント参照。値はそちらと必ず一致させること）。
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorageが使えない環境でも表示上のトグル自体は機能させる（ベストエフォート）
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next ? "#1f2937" : "#ffffff");
  }

  // 初回描画時（isDark未確定）はサーバーとクライアントで表示が食い違わないよう、
  // クリック可能だが見た目は確定させないプレースホルダにしておく。
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="ダークモード切替"
      className="shrink-0 whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {isDark === null ? "…" : isDark ? "☀️ ライト" : "🌙 ダーク"}
    </button>
  );
}
