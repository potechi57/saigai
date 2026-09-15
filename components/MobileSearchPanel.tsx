"use client";

import { useState } from "react";

// /mのトップ画面（地図）に重ねる、タップで開閉する検索パネル。
//
// 【不具合修正・会話ログより】以前は画面下端に薄い帯状のバーを常時貼り付け、
// それをタップして開閉する作りにしていたが、実機で「一度閉じると再度開けない
// （スワイプでなんとか開く）」という報告があった。原因は主に、スマホブラウザの
// アドレスバーの表示/非表示でビューポート高さが変動する問題（いわゆる
// 100vh問題）と、画面最下端はOS側のジェスチャー領域（ホームインジケーター等）と
// 重なりタップが奪われやすいこと。対策として:
//   1. 親側（app/m/page.tsx）の高さ指定を100vh→100dvh（動的ビューポート単位。
//      実際に見えている範囲に追従する）に変更
//   2. 折りたたみ時のボタンを画面最下端に貼り付ける帯ではなく、余白を持たせた
//      independent な丸ボタン（フローティングアクションボタン）に変更
//      （会話ログ「ボタン形式がよいかもしれません」）
//   3. 開いている時の閉じるボタンも、最下端ではなくパネル上部（＝画面中央寄り）に
//      配置し、OSのジェスチャー領域と重ならないようにした
// アニメーションは付けず、開閉は即座に切り替える（凝った演出よりも、
// 現場でもたつかず使えることを優先）。
export default function MobileSearchPanel({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <div className="absolute inset-x-0 bottom-0 z-[1500] flex justify-center pb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-gray-800 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-gray-700"
        >
          🔍 検索
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1500] mx-2 mb-2 flex max-h-[70vh] flex-col rounded-xl border border-gray-300 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.2)] dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between rounded-t-xl border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">検索</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          ✕ 閉じる
        </button>
      </div>
      <div className="overflow-y-auto px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}
