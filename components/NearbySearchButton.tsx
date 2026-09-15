"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readNearbyRadiusM, formatRadiusLabel, DEFAULT_NEARBY_RADIUS_M } from "@/lib/mobile-prefs";

// 現在地から探すボタン（/m専用）。半径は設定画面（/m/settings）で変更できる
// （会話ログ「現在地検索の半径変更」。既定は1km）。
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
  // 初回描画（サーバー側）ではlocalStorageを読めないため、既定値で描画してから
  // マウント後に実際の設定値へ更新する（ThemeToggle等と同じ、ハイドレーション
  // 不一致を避けるパターン）。
  const [radiusM, setRadiusM] = useState(DEFAULT_NEARBY_RADIUS_M);

  useEffect(() => {
    setRadiusM(readNearbyRadiusM());
  }, []);

  function handleClick() {
    if (!navigator.geolocation) {
      setError("この端末では現在地を取得できません。");
      return;
    }
    setLocating(true);
    setError(null);
    // クリック時点の最新設定を読み直す（設定画面から戻ってきた直後でも
    // 反映されるように）。
    const radius = readNearbyRadiusM();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        // 絞り込み・距離計算は/m（サーバー側）で行う（lib/geo.ts参照）。
        // 精度（誤差半径）も一緒に渡し、大きく誤差がある場合は結果画面側で注意書きを出す。
        router.push(`/m?lat=${latitude}&lng=${longitude}&acc=${Math.round(accuracy)}&radius=${radius}`);
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
        {locating ? "現在地を取得中..." : `📍 現在地から探す（半径${formatRadiusLabel(radiusM)}）`}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
