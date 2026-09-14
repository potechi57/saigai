"use client";

import { useEffect } from "react";

// PWA化（優先事項10 Phase 5）のためのService Worker登録。
// 本体（public/sw.js）はキャッシュ対象を静的アセットのみに限定しており、
// ページ本体やAPI応答には関与しないため、既存の全ページの表示内容には影響しない。
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 開発中（next dev）はNext.js自体が_next/static配下を都度作り直すため、
    // Service Workerがそれをキャッシュしてしまうと「保存したのに古い内容のまま」
    // という事故（Fast Refresh・ハイドレーション不一致）につながる。
    // 本番ビルド（ファイル名にハッシュが入り、内容が変われば別URLになる）でのみ登録する。
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録に失敗しても通常のWebアプリとして動作し続けるため、握りつぶして良い
      // （ホーム画面への追加ができなくなるだけで、機能自体は損なわれない）。
    });
  }, []);

  return null;
}
