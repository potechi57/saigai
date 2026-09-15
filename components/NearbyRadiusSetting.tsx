"use client";

import { useEffect, useState } from "react";
import { readNearbyRadiusM, writeNearbyRadiusM, formatRadiusLabel, NEARBY_RADIUS_OPTIONS_M } from "@/lib/mobile-prefs";

// 「現在地から探す」の検索半径を選ぶ設定（会話ログ「現在地検索の半径変更」）。
// 都市部と山間部で適した範囲が異なるため選べるようにした。
export default function NearbyRadiusSetting() {
  // 初回描画（サーバー側）ではlocalStorageを読めないため、マウント後に実際の
  // 設定値へ更新する（ThemeToggle等と同じ、ハイドレーション不一致を避けるパターン）。
  const [radius, setRadius] = useState<number | null>(null);

  useEffect(() => {
    setRadius(readNearbyRadiusM());
  }, []);

  function handleSelect(v: number) {
    setRadius(v);
    writeNearbyRadiusM(v);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {NEARBY_RADIUS_OPTIONS_M.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => handleSelect(v)}
          aria-pressed={radius === v}
          className={`rounded border px-3 py-1.5 text-sm ${
            radius === v
              ? "border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          {formatRadiusLabel(v)}
        </button>
      ))}
    </div>
  );
}
