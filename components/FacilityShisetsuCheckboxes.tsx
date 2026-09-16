"use client";

import { useState } from "react";
import type { FacilityTypeDef } from "@/lib/facility-taxonomy";

// 施設台帳タブの施設種別（施設名称／細別）を複数選択するチェックボックス群
// （会話ログ「施設種別の複数選択検索」参照）。以前はPendingLink（1クリック＝
// 即ページ遷移）のピルボタンで単一選択のみだったが、複数同時選択には
// 「いくつか選んでから検索を押す」という通常のフォーム部品が必要なため、
// 本物の<input type="checkbox">に置き換えた（name="facShisetsu"で、
// app/karte/page.tsxの同じ<Form>の他の項目と一緒に送信される）。
//
// 「すべて」は個別選択と同時に選べると意味が矛盾する（すべて＋橋梁、は
// 「すべて」に矛盾する）ため、ここでのonChangeで相互排他にする
// （会話ログ「「すべて」と個別選択を同時に選択するなど、矛盾した状態に
// ならないUIとする」参照）。ただし、これはあくまでUI上の使い勝手のための
// ガードであり、サーバー側（app/karte/page.tsx）でも「すべて」が含まれて
// いれば個別選択より優先する形で防御的に扱っている＝JSが効かない場合や
// 想定外の送信でも矛盾した絞り込みにはならない。
export default function FacilityShisetsuCheckboxes({
  types,
  selected,
  allValue,
}: {
  types: FacilityTypeDef[];
  selected: string[]; // サーバー側で算出した現在の選択（URLのfacShisetsuを正規化したもの）
  allValue: string; // 「すべて」を表す特別な値（app/karte/page.tsxのFACILITY_SHISETSU_ALL）
}) {
  const [checked, setChecked] = useState<string[]>(selected);

  function toggle(value: string) {
    setChecked((prev) => {
      if (value === allValue) {
        return prev.includes(allValue) ? [] : [allValue];
      }
      const withoutAll = prev.filter((v) => v !== allValue);
      return withoutAll.includes(value) ? withoutAll.filter((v) => v !== value) : [...withoutAll, value];
    });
  }

  const implemented = types.filter((t) => t.match);
  const pending = types.filter((t) => !t.match);

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          name="facShisetsu"
          value={allValue}
          checked={checked.includes(allValue)}
          onChange={() => toggle(allValue)}
        />
        すべて
      </label>
      {implemented.map((t) => (
        <label key={t.label} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            name="facShisetsu"
            value={t.label}
            checked={checked.includes(t.label)}
            onChange={() => toggle(t.label)}
          />
          {t.label}
        </label>
      ))}
      {pending.map((t) => (
        <label key={t.label} className="flex items-center gap-1.5 text-xs text-gray-300 dark:text-gray-600">
          <input type="checkbox" disabled />
          {t.label}（準備中）
        </label>
      ))}
    </div>
  );
}
