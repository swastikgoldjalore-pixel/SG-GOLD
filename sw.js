// SWASTIK GOLD JALORE - ZERO-CACHE NETWORK-ONLY SERVICE WORKER
// Ensures 100% real-time data delivery on every device without browser resets

const CACHE_NAME = 'swastik-gold-nocache-v3';

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

// STRICT NETWORK ONLY STRATEGY - ALWAYS FETCH FRESH DATA FROM SERVER
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
