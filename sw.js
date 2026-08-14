// Swastik Gold Jalore - Universal Real-Time Service Worker
// Enforces 100% Zero-Cache for Live Bullion Rates

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => caches.delete(key)));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // ALWAYS FETCH FRESH FROM NETWORK TO PREVENT ANY STALE RATES
    e.respondWith(
        fetch(e.request, { cache: 'no-store' }).catch(() => {
            return caches.match(e.request);
        })
    );
});
