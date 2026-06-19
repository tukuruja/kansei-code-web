// Service Worker for ツクルンジャー PWA
const CACHE_NAME = "tsukurunjya-v1";
const STATIC_ASSETS = [
  "/",
  "/photos",
  "/delivery",
  "/manifest.json",
];

// インストール時に静的アセットをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ネットワークファースト + キャッシュフォールバック
self.addEventListener("fetch", (event) => {
  // API/POSTリクエストはキャッシュしない
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功したレスポンスをキャッシュに保存
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // HTMLリクエストの場合はトップページを返す（SPA対応）
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
          return new Response("オフラインです", { status: 503 });
        });
      })
  );
});
