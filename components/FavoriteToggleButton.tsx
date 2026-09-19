"use client";

import { useState, useTransition } from "react";
import { setFavorite, type FavoriteTarget } from "@/lib/actions/favorite-actions";

// カルテ詳細画面・門型標識点検調書詳細画面のヘッダー等に置く☆/★お気に入り
// ボタン。フォームを介さず、クリックで直接Server Action（setFavorite）を呼び、
// 結果を見て表示を更新する（お気に入りは軽い操作なので、ページ遷移やフォーム
// 送信を伴わせたくないため）。楽観的にまず見た目を切り替え、失敗時のみ元に戻す
// （isPendingでボタンは無効化し連打による状態のズレを防ぐ）。
// 当初はカルテ専用（karteId/karteFacilityNo）だったが、「お気に入り追加は
// カルテのみでは意味がありません。点検調書の項目すべてに適用できるように
// してください」との指摘を受け、対象種別を問わないtarget: FavoriteTargetを
// 受け取る形に一般化した（lib/actions/favorite-actions.ts参照）。
export default function FavoriteToggleButton({
  target,
  initialIsFavorite,
}: {
  target: FavoriteTarget;
  initialIsFavorite: boolean;
}) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !isFavorite;
    setIsFavorite(next); // 楽観的更新
    setError(null);
    startTransition(async () => {
      const result = await setFavorite(target, next);
      if (!result.ok) {
        setIsFavorite(!next); // 失敗したら元に戻す
        setError(result.error);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={isFavorite}
        title={isFavorite ? "お気に入りから外す" : "お気に入りに追加"}
        className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm disabled:opacity-60 ${
          isFavorite
            ? "border-yellow-400 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
      >
        <span>{isFavorite ? "★" : "☆"}</span>
        {isFavorite ? "お気に入り済み" : "お気に入りに追加"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
