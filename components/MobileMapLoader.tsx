"use client";

import dynamic from "next/dynamic";

// components/MapLoader.tsxと同じ理由（Leafletはモジュール読み込み時に
// window/documentを直接参照するため、サーバーサイドレンダリングの中で
// 素朴にimportするとクラッシュする）でssr: falseを使う。
const MobileMapView = dynamic(() => import("./MobileMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-400 dark:bg-gray-800 dark:text-gray-500">
      地図を読み込み中...
    </div>
  ),
});

export default MobileMapView;
