const CACHE_NAME = 'heart-treasury-v1';
const assetsToCache = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css', // Update this if your CSS file has a different name or path
  './js/script.js'   // Update this if your main JS file has a different name or path
];

// Install the service worker and cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
