"use client";

import { useEffect, useState } from "react";

// 文字サイズの拡大切替（会話ログ「文字サイズの拡大」）。屋外の炎天下や老眼等での
// 読みやすさ向上を想定。実際の適用（<html class="large-text">の切替・app/globals.css
// のスケール）はThemeToggle.tsxと同じ考え方。ちらつき防止の初回ブロッキング適用は
// app/layout.tsxのFONT_SIZE_INIT_SCRIPT参照。
const STORAGE_KEY = "mobileLargeText";

export default function FontSizeToggle() {
  const [isLarge, setIsLarge] = useState<boolean | null>(null);

  useEffect(() => {
    setIsLarge(document.documentElement.classList.contains("large-text"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("large-text");
    document.documentElement.classList.toggle("large-text", next);
    setIsLarge(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // localStorageが使えない環境でも表示上のトグル自体は機能させる（ベストエフォート）
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLarge ?? false}
      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {isLarge === null ? "…" : isLarge ? "🔠 標準サイズに戻す" : "🔠 文字を大きくする"}
    </button>
  );
}
