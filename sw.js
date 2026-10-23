var APP_PREFIX = 'tally_beast_erp_';
var VERSION = 'v8';
var CACHE_NAME = APP_PREFIX + VERSION;

var CORE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/Logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install Event: Pre-cache Vercel root shell and CDN libraries
self.addEventListener('install', function(event) {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(
                CORE_ASSETS.map(function(url) {
                    var req = new Request(url, { mode: url.indexOf('http') === 0 ? 'cors' : 'same-origin' });
                    return fetch(req).then(function(res) {
                        if (res && res.status === 200) {
                            return cache.put(req, res);
                        }
                    }).catch(function(err) {
                        console.warn('SW: Skipped pre-caching asset:', url, err);
                    });
                })
            );
        })
    );
});

// Activate Event: Purge old caches immediately after a new GitHub -> Vercel deploy
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keyList) {
            return Promise.all(
                keyList.map(function(key) {
                    if (key.indexOf(APP_PREFIX) === 0 && key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Fetch Event: Smart routing for Vercel SPA, CDNs, and Google Drive OAuth
self.addEventListener('fetch', function(event) {
    var req = event.request;
    var url = new URL(req.url);

    if (req.method !== 'GET') return;

    // 1. Never intercept Google Drive API or OAuth Sign-In requests
    if (url.hostname.indexOf('googleapis.com') !== -1 ||
        url.hostname.indexOf('accounts.google.com') !== -1 ||
        url.hostname.indexOf('gstatic.com') !== -1) {
        return;
    }

    // 2. Cache-First for CDN libraries (PDF.js, SheetJS) & QR images
    if (url.hostname.indexOf('cdnjs.cloudflare.com') !== -1 ||
        url.hostname.indexOf('api.qrserver.com') !== -1) {
        event.respondWith(
            caches.match(req, { ignoreSearch: true }).then(function(cachedRes) {
                if (cachedRes) return cachedRes;
                return fetch(req).then(function(netRes) {
                    if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
                        var clone = netRes.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(req, clone);
                        });
                    }
                    return netRes;
                }).catch(function() {
                    return new Response('', { status: 408, statusText: 'Offline' });
                });
            })
        );
        return;
    }

    // 3. Network-First with Offline Cache Fallback for Vercel app shell (/ and /index.html)
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
                if (req.mode === 'navigate') {
                    return caches.match('/index.html', { ignoreSearch: true }).then(function(idxRes) {
                        return idxRes || caches.match('/', { ignoreSearch: true });
                    });
                }
            });
        })
    );
});
