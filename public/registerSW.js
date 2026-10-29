if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[VAJRA PWA] ServiceWorker successfully registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('[VAJRA PWA] ServiceWorker registration failed:', err);
      });
  });
}
