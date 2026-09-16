"use client";

import { useState, type ChangeEvent } from "react";
import { setRouteRoadType, clearRouteRoadType } from "@/lib/actions/route-road-type-actions";
import { ROAD_TYPE_GROUPS, type RoadTypeGroupKey } from "@/lib/road-type-groups";

// /settingsの路線一覧1行分。選択を変えるとその場で即保存する
// （components/MapView.tsxのホーム位置設定・components/ThemeToggle.tsx等、
// このアプリ全体で採っている「選択・クリックの都度すぐ反映する」パターンに
// 合わせている。保存ボタンは置かない）。
export default function RouteRoadTypeSelect({
  routeName,
  initialGroup,
}: {
  routeName: string;
  initialGroup: RoadTypeGroupKey | null;
}) {
  const [group, setGroup] = useState<RoadTypeGroupKey | null>(initialGroup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setSaving(true);
    setError(null);
    const result = value === "" ? await clearRouteRoadType(routeName) : await setRouteRoadType(routeName, value);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGroup(value === "" ? null : (value as RoadTypeGroupKey));
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={group ?? ""}
        onChange={handleChange}
        disabled={saving}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">未分類</option>
        {ROAD_TYPE_GROUPS.map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400 dark:text-gray-500">保存中...</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
