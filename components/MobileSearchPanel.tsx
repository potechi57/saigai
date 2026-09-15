"use client";

import { useState } from "react";

// /mのトップ画面（地図）に重ねる、タップで開閉する検索パネル。
//
// 【技術選定・会話ログより】本格的なドラッグ操作（Googleマップ風のスワイプで
// 途中の高さに止める等）も検討したが、「使いやすさを重視した設計」という
// 方針に合わせ、タップで開閉するだけのシンプルな方式を採用した
// （ドラッグ操作は、地図自体のパン操作とジェスチャーが競合しやすく、
// 手袋越し・濡れた指での操作では誤操作の元になりやすいため）。
// アニメーションも付けず、開閉は即座に切り替える（凝った演出よりも、
// 現場でもたつかず使えることを優先）。
export default function MobileSearchPanel({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1500] flex flex-col items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex w-full flex-col items-center gap-1 rounded-t-xl border border-b-0 border-gray-300 bg-white pb-2 pt-2 text-sm font-medium text-gray-700 shadow-[0_-2px_8px_rgba(0,0,0,0.12)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <span className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
        {open ? "▼ 閉じる" : "🔍 タップして検索"}
      </button>
      <div
        className={`pointer-events-auto max-h-[65vh] overflow-y-auto border-t border-gray-200 bg-white px-4 pb-4 dark:border-gray-700 dark:bg-gray-900 ${
          open ? "block" : "hidden"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
