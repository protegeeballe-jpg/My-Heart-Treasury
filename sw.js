const CACHE_NAME = 'heart-treasury-v12';

// Core static assets required for instant app startup
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/tailwind.js',
    './js/lucide.js',
    './js/storage.js',
    './js/audio.js',
    './js/media.js',
    './js/bible.js',
    './js/app.js'
];

// Install and pre-cache core static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate and clean up outdated caches immediately
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

// Fetch Strategy: Fast Cache-First for UI + Automatic Dynamic Caching for Bible files
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Bypass Google APIs and external auth
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
        return;
    }

    // Dynamic Runtime Caching for any file requested from the /bible/ folder
    if (url.pathname.includes('/bible/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Serve from cache instantly, revalidate in background
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse);
                            });
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }

                // If not yet cached, fetch from network and save to cache automatically
                return fetch(event.request)
                    .then((networkResponse) => {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                        return networkResponse;
                    })
                    .catch(() => {
                        return new Response(JSON.stringify({ error: "Offline and version not cached yet." }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    });
            })
        );
        return;
    }

    // Standard High-Performance Cache-First strategy for core local assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request)
                .then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
        })
    );
});
