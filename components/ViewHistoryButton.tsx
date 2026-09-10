"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// 閲覧履歴（直近に開いたカルテ詳細画面）。編集履歴（/karte/history）とは異なり、
// 「誰が何を見たか」は個人の端末内だけの関心事であり、事務所で共有する必要が無い
// （むしろ共有すべきではない）と考え、サーバー側には一切保存せずlocalStorageのみで
// 完結させている。記録自体はカルテ詳細画面に埋め込んだ components/RecordViewHistory.tsx
// が行い、このボタンは保存された履歴を読んで表示するだけ。
const STORAGE_KEY = "karteViewHistory";
const MAX_ENTRIES = 10;

export type ViewHistoryEntry = {
  facilityNo: string;
  routeName: string;
  viewedAt: number;
};

export function readViewHistory(): ViewHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// RecordViewHistoryから呼ばれる書き込み専用ヘルパー。同じカルテを見返した場合は
// 先頭に移動するだけにし（重複エントリを作らない）、最大件数を超えたら古いものを捨てる。
export function pushViewHistory(entry: { facilityNo: string; routeName: string }) {
  try {
    const existing = readViewHistory().filter((h) => h.facilityNo !== entry.facilityNo);
    const next = [{ ...entry, viewedAt: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorageが使えない環境（プライベートブラウズ等）では機能を諦める
  }
}

export default function ViewHistoryButton() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ViewHistoryEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setHistory(readViewHistory());

    // ボタン・パネルの外側をクリックしたら閉じる
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:text-gray-900 hover:underline dark:hover:text-gray-100"
      >
        🕘 閲覧履歴
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded border border-gray-300 bg-white p-2 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">最近見たカルテ</span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {}
                  setHistory([]);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
              >
                履歴をクリア
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">まだ履歴がありません。</p>
          ) : (
            <ul className="max-h-80 space-y-0.5 overflow-y-auto">
              {history.map((h) => (
                <li key={h.facilityNo}>
                  <Link
                    href={`/karte/${h.facilityNo}`}
                    onClick={() => setOpen(false)}
                    className="block truncate rounded px-2 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <span className="font-medium">{h.routeName}</span>
                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{h.facilityNo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
