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
  loading: () => (
    <div className="flex h-[70vh] w-full items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm text-gray-400">
      地図を読み込み中...
    </div>
  ),
});

export default MapView;
export type { MapKarte } from "./MapView";
