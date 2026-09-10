"use client";

import { useActionState, useRef, useEffect } from "react";
import { createFavoriteGroup, type FavoriteActionResult } from "@/lib/actions/favorite-actions";
import SubmitButton from "@/components/SubmitButton";

// お気に入り画面上部の「グループを作成」フォーム。例:「今年の点検場所」等、
// お気に入りをまとめる名前付きグループを作る（prisma/schema.prismaのFavoriteGroup参照）。
export default function CreateFavoriteGroupForm() {
  const [state, formAction] = useActionState<FavoriteActionResult | null, FormData>(createFavoriteGroup, null);
  const formRef = useRef<HTMLFormElement>(null);

  // 作成に成功したら入力欄を空に戻す（同じ名前の再送信で不要なエラーを出さないため）
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="name"
        placeholder="新しいグループ名（例: 今年の点検場所）"
        required
        className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <SubmitButton
        pendingLabel="作成中..."
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        ＋ グループを作成
      </SubmitButton>
      {state && !state.ok && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
