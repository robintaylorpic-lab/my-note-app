// Lumina Pro — Service Worker
// Handles offline app-shell caching so the note editor still opens without internet.
// Firebase Realtime Database syncing itself is handled by the Firebase SDK
// (it queues writes automatically and flushes them once the connection returns) —
// this file's only job is to make sure the PAGE ITSELF loads offline.

const CACHE_VERSION = 'lumina-v1'; // bump this string any time you deploy a new version
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// ---- Install: pre-cache the core app shell (same-origin files only, so one
// bad network request can't fail the whole install) ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---- Activate: clean up old cache versions ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch: ----
// 1) Page navigations -> network first, fall back to cached index.html when offline
// 2) Everything else (fonts, Firebase SDK JS, icons, etc.) -> cache first,
//    then update the cache in the background (stale-while-revalidate)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests. Firebase's realtime sync mostly uses WebSockets
  // anyway, so it never passes through here.
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          // Only cache valid, cacheable responses
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline and not cached -> just fail gracefully

      return cached || networkFetch;
    })
  );
});
