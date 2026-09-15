"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// 閲覧履歴（直近に開いたカルテ・施設台帳・台帳（画像）の詳細画面）。編集履歴
// （/karte/history）とは異なり、「誰が何を見たか」は個人の端末内だけの関心事であり、
// 事務所で共有する必要が無い（むしろ共有すべきではない）と考え、サーバー側には
// 一切保存せずlocalStorageのみで完結させている。記録自体は各詳細画面に埋め込んだ
// components/RecordViewHistory.tsx が行い、このボタンは保存された履歴を読んで
// 表示するだけ。
//
// 以前はカルテ専用（facilityNo/routeNameの2項目）だったが、施設台帳・台帳（画像）の
// 詳細ページ（/facility-list/[id]・/ledgers/[id]）でも同じ仕組みを使えるよう、
// kind（種別）・id・title（見出し）・subtitle（補足）・href（リンク先）を持つ
// 汎用的な形に一般化した（会話ログ「それ以外の登録や編集の内容を表示するように
// してほしい」参照。閲覧履歴も同じ発想で対象を広げる）。同一エントリの重複判定は
// facilityNoではなくkind+idの組で行う（3種別でidの体系が別物のため）。
const STORAGE_KEY = "recordViewHistory";
const MAX_ENTRIES = 10;

export type ViewHistoryKind = "karte" | "facility" | "ledger" | "gate_sign_inspection" | "bridge_ledger";

export type ViewHistoryEntry = {
  kind: ViewHistoryKind;
  id: string;
  title: string; // 一覧に太字で表示する見出し（カルテ:路線名、施設台帳:管理番号、台帳（画像）:表示名）
  subtitle?: string; // 見出しの補足（カルテ:施設管理番号等）
  href: string;
  viewedAt: number;
};

const KIND_LABEL: Record<ViewHistoryKind, string> = {
  karte: "点検調書",
  facility: "施設台帳",
  ledger: "台帳（画像）",
  gate_sign_inspection: "点検調書（門型標識）",
  bridge_ledger: "橋梁台帳",
};

export function readViewHistory(): ViewHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// RecordViewHistoryから呼ばれる書き込み専用ヘルパー。同じ対象（kind+id）を見返した
// 場合は先頭に移動するだけにし（重複エントリを作らない）、最大件数を超えたら
// 古いものを捨てる。
export function pushViewHistory(entry: Omit<ViewHistoryEntry, "viewedAt">) {
  try {
    const existing = readViewHistory().filter((h) => !(h.kind === entry.kind && h.id === entry.id));
    const next = [{ ...entry, viewedAt: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorageが使えない環境（プライベートブラウズ等）では機能を諦める
  }
}

export default function ViewHistoryButton({ compact }: { compact?: boolean }) {
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
        aria-label="閲覧履歴"
        className={compact ? "text-base" : "hover:text-gray-900 hover:underline dark:hover:text-gray-100"}
      >
        {compact ? "🕘" : "🕘 閲覧履歴"}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded border border-gray-300 bg-white p-2 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">最近見た記録</span>
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
                <li key={`${h.kind}:${h.id}`}>
                  <Link
                    href={h.href}
                    onClick={() => setOpen(false)}
                    className="block truncate rounded px-2 py-1.5 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <span className="mr-1.5 inline-block rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {KIND_LABEL[h.kind]}
                    </span>
                    <span className="font-medium">{h.title}</span>
                    {h.subtitle && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{h.subtitle}</span>
                    )}
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
