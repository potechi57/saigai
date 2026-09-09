"use client";

import { useState } from "react";

// カルテ詳細画面を「Excelのシート切替」風に見せるためのタブ。タブを画面下部に置き、
// クリックでシート（様式Ａ／様式Ｃ／様式Ｄ／カルテ資料）を切り替える
// （本物のExcelの画面下部シートタブを模している）。
// 中身は各シートのServer Component側で描画済みのJSXをそのまま受け取るだけで、
// このコンポーネント自体はどのタブを表示するかの状態だけを持つ。
export type SheetTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export default function SheetTabs({ tabs, defaultTabId }: { tabs: SheetTab[]; defaultTabId?: string }) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div>
      <div>{active?.content}</div>
      <div className="flex flex-wrap gap-0.5 border-t border-gray-400 bg-gray-200 px-2 pt-1 dark:border-gray-600 dark:bg-gray-800">
        {tabs.map((t) => {
          const isActive = t.id === active?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              aria-current={isActive}
              className={
                isActive
                  ? "rounded-t border border-b-0 border-gray-400 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  : "rounded-t border border-b-0 border-transparent px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
