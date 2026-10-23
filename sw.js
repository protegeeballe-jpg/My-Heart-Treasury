const CACHE_NAME = 'heart-treasury-v7';

// Install and pre-cache core local assets with graceful error trapping
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Using explicit paths that work reliably on GitHub Pages subpaths
            return cache.addAll([
                './',
                './index.html',
                './manifest.json',
                './css/styles.css',
                './js/tailwind.js',
                './js/lucide.js',
                './js/storage.js',
                './js/audio.js',
                './js/media.js',
                './js/app.js'
            ]).catch(err => {
                console.warn('Cache addAll warning during install:', err);
            });
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

// Robust Fetch Strategy: Network First, falling back cleanly to Cache
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Bypass Service Worker cache for Google APIs and external auth
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || caches.match('./index.html');
                });
            })
    );
});
