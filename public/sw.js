// VAJRA Service Worker - Automatic Cache Invalidation & Network-First Gateway
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[VAJRA SW] Purging outdated cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh from network; fall back to cache only when offline
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
