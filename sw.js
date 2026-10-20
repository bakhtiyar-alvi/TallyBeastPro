var APP_PREFIX = 'tally_beast_erp_';
var VERSION = 'v5.0';
var CACHE_NAME = APP_PREFIX + VERSION;

var CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './Logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install Event: Pre-cache core shell and CDN assets
self.addEventListener('install', function(event) {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(
                CORE_ASSETS.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.warn('SW: Skipped caching asset:', url, err);
                    });
                })
            );
        })
    );
});

// Activate Event: Clean up legacy caches and take immediate control
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keyList) {
            return Promise.all(
                keyList.map(function(key) {
                    if (key.indexOf(APP_PREFIX) === 0 && key !== CACHE_NAME) {
                        console.log('SW: Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch Event: Optimized routing strategies
self.addEventListener('fetch', function(event) {
    var req = event.request;
    var url = new URL(req.url);

    // Only handle GET requests
    if (req.method !== 'GET') return;

    // Bypass Google Accounts / Sign-In / Auth APIs to prevent credential caching bugs
    if (url.hostname.indexOf('googleapis.com') !== -1 ||
        url.hostname.indexOf('accounts.google.com') !== -1 ||
        url.hostname.indexOf('gstatic.com') !== -1) {
        return;
    }

    // Strategy for CDNs and QR code generators: Cache First, fallback to Network & update cache
    if (url.hostname.indexOf('cdnjs.cloudflare.com') !== -1 ||
        url.hostname.indexOf('api.qrserver.com') !== -1) {
        event.respondWith(
            caches.match(req, { ignoreSearch: true }).then(function(cachedRes) {
                if (cachedRes) return cachedRes;
                return fetch(req).then(function(netRes) {
                    if (netRes && netRes.status === 200) {
                        var clone = netRes.clone();
                        caches.open(CACHE_NAME).then(function(cache) { 
                            cache.put(req, clone); 
                        });
                    }
                    return netRes;
                }).catch(function() {
                    // Return nothing if offline and not in cache for external assets
                    return new Response('', { status: 408, statusText: 'Offline / CDN unavailable' });
                });
            })
        );
        return;
    }

    // Strategy for local app files: Network First with Cache Fallback
    event.respondWith(
        fetch(req).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
                var responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache) { 
                    cache.put(req, responseClone); 
                });
            }
            return networkResponse;
        }).catch(function() {
            return caches.match(req, { ignoreSearch: true }).then(function(cachedResponse) {
                if (cachedResponse) return cachedResponse;
                // Fallback to index.html for SPA navigation requests when offline
                if (req.mode === 'navigate') {
                    return caches.match('./index.html', { ignoreSearch: true });
                }
            });
        })
    );
});
