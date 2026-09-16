"use client";

import { useState } from "react";
import Link from "next/link";
import { clearHomeLocation } from "@/lib/actions/settings-actions";
import type { HomeLocation } from "@/components/MapLoader";

// /settingsの「ホーム位置」欄（会話ログ「ホーム位置の設定やダークモードなどの
// 設定も設定に加えてください」参照）。実際に地図上の位置をクリックして設定する
// 操作自体は、既存のcomponents/MapView.tsx（地図が無いと緯度経度を指定できない
// ため）に残したまま、ここでは「現在の設定状況の確認」「解除」「地図（クリックして
// 設定するモード）を開く導線」だけを提供する。
export default function HomeLocationSettings({ home }: { home: HomeLocation }) {
  const [cleared, setCleared] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = cleared ? null : home;

  async function handleClear() {
    setClearing(true);
    setError(null);
    const result = await clearHomeLocation();
    setClearing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCleared(true);
  }

  return (
    <div className="space-y-2 text-sm">
      {current ? (
        <div className="text-gray-700 dark:text-gray-200">
          <p className="font-medium">{current.label || "（名称未設定）"}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            緯度経度: {current.latitude}, {current.longitude}
          </p>
        </div>
      ) : (
        <p className="text-gray-400 dark:text-gray-500">未設定です。</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/karte?setHome=1"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          🏠 地図で{current ? "変更" : "設定"}する
        </Link>
        {current && (
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
          >
            {clearing ? "解除中..." : "解除する"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
