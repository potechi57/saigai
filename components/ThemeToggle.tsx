"use client";

import { useEffect, useState } from "react";

// ダークモード切替ボタン。実際の判定・適用はapp/layout.tsxの<html>クラス操作と
// インラインスクリプト（初回描画前にlocalStorage/OS設定を見て<html>にdarkクラスを
// 付ける。ちらつき防止のため）が担う。このコンポーネントはその状態を反映・トグルするだけ。
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
  }

  // 初回描画時（isDark未確定）はサーバーとクライアントで表示が食い違わないよう、
  // クリック可能だが見た目は確定させないプレースホルダにしておく。
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="ダークモード切替"
      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {isDark === null ? "…" : isDark ? "☀️ ライト" : "🌙 ダーク"}
    </button>
  );
}
