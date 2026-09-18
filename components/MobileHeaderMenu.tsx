"use client";

// スマホ幅（sm未満）専用のヘッダーメニュー。ハンバーガーボタン1つに折りたたみ、
// 開くと📱現場用・★お気に入り・🕘閲覧履歴・⚙️設定への導線をタップしやすい
// 縦並びの行として表示する。
//
// 【経緯】以前はこれら4項目を単体のアイコンだけのリンクとしてヘッダーに横並びで
// 直接置いていたが、スマホでは小さすぎて押しにくいという指摘を受けた
// （会話ログ「スマホ画面ではボタンが小さすぎて操作しにくい」参照）。PC向けの
// ヘッダー（sm:flex側のnav、app/layout.tsx参照）はラベル付きで十分な大きさが
// あるため変更していない。
//
// ViewHistoryButton（閲覧履歴）は、履歴一覧の読み込み・表示ロジックを自前で
// 持つ独立した部品のため置き換えず、メニュー内の1行としてそのまま埋め込んで
// 再利用する（開閉状態も独立して持つため、閲覧履歴の行だけを開いてもメニュー
// 全体が閉じることはない）。
import { useEffect, useRef, useState } from "react";
import ViewHistoryButton from "@/components/ViewHistoryButton";

const MENU_ROW_CLASS =
  "flex items-center gap-3 rounded px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700";

export default function MobileHeaderMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative sm:hidden">
      {/* タップ領域を十分に確保するため、アイコン自体は既存と同じ大きさのまま
          ボタンにp-2（44px相当のタップ領域）を持たせる。 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="メニュー"
        aria-expanded={open}
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded text-xl text-gray-600 dark:text-gray-300"
      >
        ☰
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded border border-gray-300 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <a href="/m" className={MENU_ROW_CLASS} onClick={() => setOpen(false)}>
            <span className="text-base">📱</span>
            現場用
          </a>
          <a href="/m/favorites" className={MENU_ROW_CLASS} onClick={() => setOpen(false)}>
            <span className="text-base">★</span>
            お気に入り
          </a>
          <ViewHistoryButton className={`w-full ${MENU_ROW_CLASS}`} />
          <a href="/m/settings" className={MENU_ROW_CLASS} onClick={() => setOpen(false)}>
            <span className="text-base">⚙️</span>
            設定
          </a>
        </div>
      )}
    </div>
  );
}
