"use client";

import dynamic from "next/dynamic";

// Leafletはモジュール読み込み時にwindow/documentを直接参照するため、サーバー側の
// 初期HTML生成でそのままimportするとクラッシュする。components/MapLoader.tsxと
// 同じ理由・同じやり方で、ssr: false のクライアント専用コンポーネントとして読み込む。
const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
      地図を読み込み中...
    </div>
  ),
});

export default LocationPickerMap;
