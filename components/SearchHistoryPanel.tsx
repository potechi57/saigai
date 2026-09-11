"use client";

import { useEffect, useState } from "react";
import PendingLink from "@/components/PendingLink";

// 検索条件パネルに表示する「最近の検索」。ログイン機能が無いMVPのため、
// 事務所で共有するのではなく端末（ブラウザ）ごとのlocalStorageに保持する
// （閲覧履歴 components/ViewHistoryButton.tsx と同じ考え方）。
// currentLabelは現在の検索条件を人が読める形にまとめた文字列で、サーバー側
// （app/karte/page.tsx）が条件が1つも無い場合はnullを渡す＝記録しない。
type HistoryEntry = { query: string; label: string; savedAt: number };

const STORAGE_KEY = "karteSearchHistory";
const MAX_ENTRIES = 8;

export default function SearchHistoryPanel({
  currentQuery,
  currentLabel,
}: {
  currentQuery: string; // 例: "routeName=...&karteType=..."（「表示方法」は含まない）
  currentLabel: string | null;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing: HistoryEntry[] = raw ? JSON.parse(raw) : [];
      if (currentLabel) {
        const withoutDup = existing.filter((h) => h.query !== currentQuery);
        const next = [{ query: currentQuery, label: currentLabel, savedAt: Date.now() }, ...withoutDup].slice(
          0,
          MAX_ENTRIES
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setHistory(next);
      } else {
        // 無条件（初期画面）で開いた場合は記録を汚さず、既存の履歴を読み込むだけにする
        setHistory(existing);
      }
    } catch {
      // localStorageが使えない環境（プライベートブラウズ等）では機能を諦める
    }
  }, [currentQuery, currentLabel]);

  function clearHistory() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setHistory([]);
  }

  if (history.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">最近の検索</h3>
        <button
          type="button"
          onClick={clearHistory}
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
        >
          履歴をクリア
        </button>
      </div>
      <ul className="space-y-0.5">
        {history.map((h) => (
          <li key={h.query + h.savedAt}>
            <PendingLink
              href={`/karte${h.query ? `?${h.query}` : ""}`}
              title={h.label}
              className="block truncate rounded px-2 py-1 text-xs text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-800"
            >
              {h.label}
            </PendingLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
