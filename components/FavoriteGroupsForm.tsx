"use client";

import { useActionState } from "react";
import { setFavoriteGroups, type FavoriteActionResult } from "@/lib/actions/favorite-actions";

// お気に入り一覧の各行に置く、所属グループのチェックボックス群。
// チェックのたびに自動送信し、
// setFavoriteGroupsが一括で所属グループを置き換える。
export default function FavoriteGroupsForm({
  favoriteId,
  groups,
  selectedGroupIds,
}: {
  favoriteId: string;
  groups: { id: string; name: string }[];
  selectedGroupIds: string[];
}) {
  const action = setFavoriteGroups.bind(null, favoriteId);
  const [state, formAction] = useActionState<FavoriteActionResult | null, FormData>(action, null);

  if (groups.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">グループがまだありません。上部から作成してください。</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {groups.map((g) => (
        <label key={g.id} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            name="groupIds"
            value={g.id}
            defaultChecked={selectedGroupIds.includes(g.id)}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600"
          />
          {g.name}
        </label>
      ))}
      {state && !state.ok && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
