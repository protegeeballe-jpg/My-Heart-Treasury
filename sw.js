// My Heart Treasury PWA cache.
// Increment the version when publishing a new app-shell release.
const CACHE_NAME = 'heart-treasury-v9';
const CACHE_PREFIX = 'heart-treasury-';

const APP_SHELL = [
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

// Pre-cache the app shell so installed launches have a local copy available.
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
            await cache.addAll(APP_SHELL);
        } catch (error) {
            // Keep installation resilient on unreliable connections.
            console.warn('[Heart Treasury] App-shell pre-cache was incomplete:', error);
        }

        await self.skipWaiting();
    })());
});

// Remove only older Heart Treasury caches; leave caches owned by other apps alone.
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();

        await Promise.all(
            cacheNames
                .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map((name) => caches.delete(name))
        );

        await self.clients.claim();
    })());
});

// Stale-while-revalidate for same-origin files:
// return a cached response immediately, then refresh it in the background.
// Cross-origin requests (Google sign-in, Fonts, APIs) remain browser-managed.
self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        const networkUpdate = fetch(request)
            .then((response) => {
                if (response && response.ok && response.type === 'basic') {
                    cache.put(request, response.clone()).catch((cacheError) => {
                        console.warn('[Heart Treasury] Cache refresh failed:', cacheError);
                    });
                }
                return response;
            })
            .catch(() => null);

        if (cachedResponse) {
            // Keep the refresh alive without delaying the cached app response.
            event.waitUntil(networkUpdate.then(() => undefined));
            return cachedResponse;
        }

        const networkResponse = await networkUpdate;
        if (networkResponse) return networkResponse;

        // If an offline navigation URL is not an exact cache key, serve the app shell.
        if (request.mode === 'navigate') {
            return (await cache.match('./index.html')) || (await cache.match('./'));
        }

        return new Response('This resource is not available offline.', {
            status: 504,
            statusText: 'Offline'
        });
    })());
});
