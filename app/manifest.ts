import type { MetadataRoute } from "next";

// PWA化（優先事項10「現場（スマホ）向け画面の本格実装」Phase 5）の一環。
// スマホのホーム画面に追加できるようにするためのマニフェスト。
// アイコンはデザイナー素材が無いため、既存UIの配色（ヘッダー・主要ボタンの
// gray-800）に合わせた簡易な地図ピンアイコンを生成して使っている
// （public/icon-512*.png・app/icon.png・app/apple-icon.png。生成スクリプトは
// 使い捨てのため残していない。差し替えたい場合はこのファイルのicons配列と
// app/icon.png・app/apple-icon.pngを置き換えればよい）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "道路施設管理 Web GIS",
    short_name: "道路施設管理",
    description: "道路施設の点検・台帳管理支援システム",
    start_url: "/m",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f2937",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
