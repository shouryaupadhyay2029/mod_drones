if ('serviceWorker' in navigator) {
  // Purge any stale pre-cached artifacts from earlier builds on localhost
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.includes('local-assets') || key.includes('app-runtime') || key.includes('workbox-precache')) {
            console.log('[VAJRA Dev] Clearing stale cache:', key);
            caches.delete(key);
          }
        }
      });
    }
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[VAJRA PWA] ServiceWorker successfully registered:', reg.scope);
        // Force update check immediately
        reg.update();
      })
      .catch((err) => {
        console.warn('[VAJRA PWA] ServiceWorker registration failed:', err);
      });

    // Auto-reload when new service worker takes over to apply fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[VAJRA PWA] New service worker activated, reloading for latest UI...');
      window.location.reload();
    });
  });
}
