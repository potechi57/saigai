"use client";

import { useState, useTransition } from "react";
import { updateJudgment, type JudgmentTarget } from "@/lib/actions/judgment-actions";
import { JUDGMENT_BADGE } from "@/lib/labels";

// 点検調書（門型標識・橋梁・法面構造物）の判定区分／点検者の評価を、詳細画面上で
// 直接編集するためのフォーム（会話ログ「カルテ以外への対応区分・判定区分の
// 直接更新機能」参照。lib/actions/judgment-actions.ts参照）。
// FavoriteToggleButton.tsxと同じ方針（フォーム送信ではなくクリックで直接
// Server Actionを呼ぶ。楽観的更新＋失敗時ロールバック）だが、こちらは値の
// 選択を伴うため、選択直後に自動保存する（保存ボタンを別途設けると
// 「選んだのに反映されない」という誤操作を招きやすいため）。
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
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updateJudgment(target, next);
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        aria-label="判定区分を手動で更新"
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
      {isPending && <span className="text-xs text-gray-400 dark:text-gray-500">更新中...</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
