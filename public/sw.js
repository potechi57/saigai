// 最小限のService Worker（PWAとしてホーム画面に追加できるようにするための対応。
// 優先事項10「現場（スマホ）向け画面の本格実装」Phase 5の一部）。
//
// 「Phase 6（電波の弱い現場での耐性・データのオフライン一時保持）」は、
// 競合解決や写真アップロードの扱い等、本格的な技術探索を経てから着手する方針の
// ため、ここでは意図的にキャッシュ範囲を静的アセット（アイコン・マニフェスト・
// Next.jsのビルド済みJS/CSS＝ファイル名にハッシュが入り内容が変われば
// URLも変わるもの）だけに限定している。
//
// ページ本体（HTML）・API・Server Actionsの応答は絶対にキャッシュしない。
// もしページ全体をキャッシュしてしまうと、現場で「実は更新済みのはずのカルテが
// 古い内容のまま表示され続ける」「写真を上げたのに一覧に反映されない」といった
// 事故に直結するため。

const CACHE_NAME = "webgis-static-v1";
const PRECACHE_URLS = ["/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // 初回プリキャッシュに失敗してもインストール自体は継続させる
        // （オフライン時のインストール等、ここで失敗しても致命的ではないため）。
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // GET以外（Server ActionsのPOST等）には一切関与せず、通常通りネットワークへ流す。
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || PRECACHE_URLS.includes(url.pathname);
  if (!isStaticAsset) return; // ページ本体・API等はService Workerを素通りさせる

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
        return res;
      });
    })
  );
});
