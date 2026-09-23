"use client";

import { useState, useTransition } from "react";
import { updateJudgment, type JudgmentTarget } from "@/lib/actions/judgment-actions";
import { JUDGMENT_BADGE } from "@/lib/labels";

// 点検調書（門型標識・橋梁・法面構造物）の判定区分／点検者の評価を、詳細画面上で
// 直接編集するためのフォーム（会話ログ「カルテ以外への対応区分・判定区分の
// 直接更新機能」参照。lib/actions/judgment-actions.ts参照）。
//
// 以前は選択した瞬間に自動保存する方式（FavoriteToggleButton.tsxのお気に入り
// 登録と同じ「クリックで直接反映」の考え方）だったが、判定区分は軽々しく
// 変えるものではないとの指摘を受け（会話ログ「簡単に変えるものではないので、
// 現在の簡単に修正できる仕様はやめてください」参照）、他の編集（例:
// app/map/[karteNo]/targets/[targetId]/edit/page.tsxの「保存する」ボタン式
// フォーム）と同じく、選択しただけでは反映されず、明示的に「保存」ボタンを
// 押して初めて更新される方式に変更した。
export default function JudgmentEditForm({
  target,
  initialValue,
  options,
}: {
  target: JudgmentTarget;
  initialValue: string | null;
  // 門型標識・橋梁はⅠ〜Ⅳ、法面構造物はⅠ〜Ⅲ（呼び出し側で渡す。
  // lib/labels.tsのJUDGMENT_BADGEはⅠ〜Ⅳ両方の配色を持つため共通で使える）。
  options: readonly string[];
}) {
  const initial = initialValue ?? "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = value !== initial;

  function handleSave() {
    setError(null);
    setSavedMessage(false);
    startTransition(async () => {
      const result = await updateJudgment(target, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedMessage(true);
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
          setSavedMessage(false);
        }}
        disabled={isPending}
        aria-label="判定区分を編集"
        className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
          value ? (JUDGMENT_BADGE[value] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300") : "bg-white dark:bg-gray-800"
        }`}
      >
        <option value="">未設定</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {isDirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      )}
      {!isDirty && savedMessage && <span className="text-xs text-green-600 dark:text-green-400">保存しました</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
