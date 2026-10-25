// 學校GTA - 輕量 PWA Service Worker
const CACHE_NAME = 'school-gta-pwa-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

// 安裝事件：預先快取核心資源並跳過等待
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[PWA SW] Precache partial error:', err);
      });
    })
  );
});

// 啟動事件：接管頁面並清理過期快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

// 擷取事件：網路優先，離線回退至快取（保證符合 PWA 安裝標準同時即時載入最新代碼）
self.addEventListener('fetch', (event) => {
  // 僅處理同源或 HTTP/HTTPS GET 請求
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // 請求成功時快取靜態資源 (css, js, html, 圖片, 字型)
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // 網路離線或連線失敗時回退至本地快取
        const cached = await caches.match(event.request);
        if (cached) {
          return cached;
        }
        // 導航請求回退至首頁
        if (event.request.mode === 'navigate') {
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
        }
        return new Response('離線模式', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
