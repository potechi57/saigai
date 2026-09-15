"use client";

import { useState } from "react";

// バージョン確認・強制更新（会話ログ「アプリの更新・バージョン確認」）。
//
// 表示しているバージョン（Gitコミットの先頭7桁・ビルド日時）はnext.config.mjsが
// ビルド時に埋め込んだ値（NEXT_PUBLIC_GIT_SHA・NEXT_PUBLIC_BUILD_TIME）。
// 不具合を報告いただく際、どの版で発生したか特定しやすくする目的。
//
// 「最新版に更新」は、Service Worker（public/sw.js）の登録解除とキャッシュの
// 全削除→再読み込みを行う。public/sw.js自体は_next/static配下（ファイル名に
// 内容のハッシュが入るため、新しいデプロイでは自動的に別URLになり、常に新しい
// 方が取得される）しかキャッシュしていないため、通常はこの操作をしなくても
// 新しいデプロイは自動的に反映されるはずだが、「アプリが古いまま固まって
// いるように見える」といった万一の際の、利用者自身でできる切り分け・
// トラブルシュート手段として用意した。
export default function AppVersionSection() {
  const [updating, setUpdating] = useState(false);
  const sha = process.env.NEXT_PUBLIC_GIT_SHA;
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  async function handleUpdate() {
    setUpdating(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // 失敗しても最終的にreloadはするので、ここでは握りつぶしてよい
    } finally {
      window.location.reload();
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 dark:text-gray-500">
        バージョン: {sha && sha !== "local" ? sha.slice(0, 7) : "開発版"}
        {buildTime && `（${new Date(buildTime).toLocaleString("ja-JP")} ビルド）`}
      </p>
      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {updating ? "更新中..." : "🔄 最新版に更新"}
      </button>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        アプリの表示がおかしい・古いままだと感じたときにお試しください。
      </p>
    </div>
  );
}
