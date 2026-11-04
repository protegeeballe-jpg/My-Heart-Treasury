const CACHE_PREFIX = 'heart-treasury-';
const CACHE_NAME = 'heart-treasury-v16';
const APP_SCOPE_URL = new URL(self.registration.scope);

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

// Install and pre-cache core static assets before activating the new worker.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Delete only caches owned by My Heart Treasury, never unrelated origin caches.
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        const ownedOldCaches = keys.filter((key) =>
            key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
        );

        await Promise.all(ownedOldCaches.map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

// Fetch Strategy: Fast Cache-First for UI + Automatic Dynamic Caching for Bible files
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Never intercept requests outside this app's own origin and URL scope.
    if (url.origin !== APP_SCOPE_URL.origin ||
        !url.pathname.startsWith(APP_SCOPE_URL.pathname)) {
        return;
    }

    // Bypass Google APIs and external authentication endpoints.
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
        return;
    }

    // Dynamic runtime caching for Bible files, with explicit HTTP error handling.
    if (url.pathname.includes('/bible/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((appCache) => appCache.match(event.request)).then((cachedResponse) => {
                if (cachedResponse) {
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.ok) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                    }).catch(() => {});

                    return cachedResponse;
                }

                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || !networkResponse.ok) {
                        throw new Error('Bible file request failed.');
                    }

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });

                    return networkResponse;
                }).catch(() => new Response(
                    JSON.stringify({ error: 'Bible file unavailable offline and not yet cached.' }),
                    {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    }
                ));
            })
        );
        return;
    }

    // Cache-first for local app assets, with background refresh for cached files.
    event.respondWith(
        caches.open(CACHE_NAME).then((appCache) => appCache.match(event.request)).then((cachedResponse) => {
            if (cachedResponse) {
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});

                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                if (event.request.mode === 'navigate') {
                    const fallbackUrl = new URL('index.html', APP_SCOPE_URL).href;
                    return caches.open(CACHE_NAME)
                        .then((appCache) => appCache.match(fallbackUrl))
                        .then((fallback) =>
                        fallback || new Response('My Heart Treasury is unavailable offline.', {
                            status: 503,
                            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                        })
                    );
                }

                return new Response('This resource is unavailable offline.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            });
        })
    );
});
