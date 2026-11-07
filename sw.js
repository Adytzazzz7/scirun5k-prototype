const CACHE_NAME = 'scirun5k-v0-48';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './timer-core.js',
  './pending-session-store.js',
  './dashboard-metrics.js',
  './workout-view.js',
  './state-backup.js',
  './experience.js',
  './experience.css',
  './theme-graphite.css',
  './palette-options.css',
  './fonts/Barlow-Regular.ttf',
  './fonts/Barlow-SemiBold.ttf',
  './fonts/Barlow-Bold.ttf',
  './fonts/Barlow-Black.ttf',
  './liquid-glass.css',
  './app.css'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        } catch {}
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});



