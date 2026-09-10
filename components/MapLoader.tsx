"use client";

import dynamic from "next/dynamic";

// Leafletはモジュール読み込み時にwindow/documentを直接参照するため、
// サーバーサイドレンダリング（Reactサーバーコンポーネントの初期HTML生成）の中で
// 素朴にimportすると "ReferenceError: window is not defined" でクラッシュする。
// ssr: false でクライアント側だけで読み込むようにする。
// なお ssr: false は Server Component から直接 next/dynamic を呼ぶと使えないため、
// この "use client" ファイルを間に挟んでいる。
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  // 親要素（地図中心画面ではh-[calc(100vh-...)]、お気に入り画面等では固定高さ）が
  // 高さを決めるので、ロード中プレースホルダーもh-full w-fullで親に追従させる。
  loading: () => (
    <div className="flex h-full min-h-[240px] w-full items-center justify-center bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
      地図を読み込み中...
    </div>
  ),
});

export default MapView;
export type { MapKarte, HomeLocation } from "./MapView";
