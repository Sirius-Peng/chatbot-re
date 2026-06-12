// 传讯 (ChuanXun) Service Worker - PWA 离线支持
var CACHE_NAME = 'chuanxun-v1';
var ASSETS = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/assets/icons/icon.svg',
    '/css/styles.css',
    '/css/diary.css',
    '/css/home.css',
    '/css/pet-style.css',
    '/css/moments.css',
    '/css/map.css',
    '/css/shop.css',
    '/assets/vendor/localforage/localforage.min.js',
    '/assets/vendor/jszip/jszip.min.js',
    '/assets/vendor/dexie/dexie.min.js',
    '/assets/vendor/fontawesome/css/all.min.css',
    '/assets/vendor/fontawesome/webfonts/fa-brands-400.woff2',
    '/assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
    '/assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
    '/assets/vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
    '/js/config.js',
    '/js/db.js',
    '/js/utils.js',
    '/js/backup-engine.js',
    '/js/state.js',
    '/js/core.js',
    '/js/home.js',
    '/js/features/mood.js',
    '/js/features/envelope.js',
    '/js/features/red-packet.js',
    '/js/features/reply-library.js',
    '/js/features/theme-editor.js',
    '/js/features/group-chat.js',
    '/js/features/call.js',
    '/js/features/todo.js',
    '/js/features/menstrual.js',
    '/js/features/music.js',
    '/js/features/chat-search.js',
    '/js/features/prompt-manager.js',
    '/js/features/ai-engine.js',
    '/js/features/companion.js',
    '/js/features/desktop.js',
    '/js/diary.js',
    '/js/accounting.js',
    '/js/moyu.js',
    '/js/features/map.js',
    '/js/games.js',
    '/js/features.js',
    '/js/data.js',
    '/js/onboarding.js',
    '/js/listeners.js',
    '/js/listeners-step2.js',
    '/js/listeners-voice.js',
    '/js/listeners-sticker.js',
    '/js/app.js',
    '/js/pet-game.js',
    '/js/ta-phone.js',
    '/js/shop.js',
    '/js/gift-cabinet.js',
    '/js/moments.js',
    '/js/tarot.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Caching ' + ASSETS.length + ' assets');
            return cache.addAll(ASSETS).catch(function(err) {
                console.warn('[SW] Some assets failed to cache:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) { return key !== CACHE_NAME; })
                    .map(function(key) { return caches.delete(key); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;
    if (event.request.url.startsWith('https://api.deepseek.com')) return;

    var url = new URL(event.request.url);
    var isAppAsset = /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname === '/';

    event.respondWith(
        isAppAsset
            // Network-first for app assets: always try network, fall back to cache
            ? fetch(event.request).then(function(response) {
                if (response && response.status === 200) {
                    var cloned = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, cloned);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request);
            })
            // Cache-first for vendor/static assets
            : caches.match(event.request).then(function(cached) {
                return cached || fetch(event.request).then(function(response) {
                    if (response && response.status === 200) {
                        var cloned = response.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, cloned);
                        });
                    }
                    return response;
                });
            })
    );
});
