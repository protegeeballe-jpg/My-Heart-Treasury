const CACHE_NAME = 'heart-treasury-v4';
const assetsToCache = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/storage.js',
    './js/audio.js',
    './js/media.js',
    './js/app.js'
];

// Install and pre-cache core local assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(assetsToCache);
        })
    );
    self.skipWaiting();
});

// Activate and clean up old caches immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('Deleting outdated cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Network-First Fetch Strategy (Checks server first for latest updates, falls back to cache offline)
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If online: grab the absolute freshest file from the server and update the cache
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // If offline: fall back to the last known cached version
                return caches.match(event.request);
            })
    );
});
