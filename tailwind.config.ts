import type { Config } from "tailwindcss";

const config: Config = {
  // クラス（<html class="dark">）でダークモードを切り替える。
  // OS設定に自動追従するだけの"media"ではなく、ユーザーがトグルで選べるようにするため。
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // lib/labels.tsのRESPONSE_META.badgeColor等、Tailwindクラス名を文字列として
    // 保持しているファイルもスキャン対象に含める（含めないと該当クラスがビルドから
    // 削られてしまい、対応区分バッジの背景色が付かない）。
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
