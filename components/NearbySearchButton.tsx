"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 現在地から半径1km以内のカルテを探すボタン（/m専用）。
//
// 【技術選定・会話ログより】PC側の地図（MapView.tsx handleLocate）が使っている
// ブラウザ標準のnavigator.geolocation APIをそのまま踏襲する。既に本番で
// 動作実績があり、外部サービス・APIキー・追加費用が一切不要なため
// （代替案として検討したPostGIS等の本格的なDB側の地理空間検索は、
// 対象カルテが127件程度の現状の規模には過剰と判断し見送った）。
//
// PC側の実装からの改善点: enableHighAccuracy・timeoutを明示指定する
// （PC側は未指定のため、電波の弱い現場で「取得中...」のまま固まりうる懸念があった）。
export default function NearbySearchButton() {
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!navigator.geolocation) {
      setError("この端末では現在地を取得できません。");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        // 集計結果の絞り込み・距離計算は/m（サーバー側）で行う（lib/geo.ts参照）。
        // 精度（誤差半径）も一緒に渡し、大きく誤差がある場合は結果画面側で注意書きを出す。
        router.push(`/m?lat=${latitude}&lng=${longitude}&acc=${Math.round(accuracy)}`);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません。端末のブラウザ設定で位置情報を許可してください。"
            : err.code === err.TIMEOUT
              ? "現在地の取得がタイムアウトしました。電波の良い場所で再度お試しください。"
              : `現在地を取得できませんでした（${err.message}）`
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={locating}
        className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {locating ? "現在地を取得中..." : "📍 現在地から探す（半径1km）"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
