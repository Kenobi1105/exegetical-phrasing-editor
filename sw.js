/* ════════════════════════════════════════
   SERVICE WORKER — Exegetical Phrasing Editor
   Auto cache-busting: bump APP_VERSION on each deploy
════════════════════════════════════════ */
const APP_VERSION = '202607231230';
const CACHE_NAME  = 'exeg-app-v' + APP_VERSION;

/* sw.js must never be listed in PRECACHE — the browser always fetches sw.js
   directly from the network (bypassing the service worker entirely) for its
   built-in update check. Caching it here would have no effect anyway. */
const PRECACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './bible.js',
  './lang.js',
  './tut.js',
  './data/index.json',
  './data/sblgnt.json',
  './data/byz.json',
  './data/lxx.json',
  './data/wlc.json',
  './data/vulgate.json',
  './data/cuv_s.json',
  './data/cuv_t.json',
];

/* All files served cache-first. The browser always fetches sw.js directly from
   the network (bypassing the service worker) for its built-in update check —
   so new version detection works without needing index.html to be network-first.
   When a new sw.js is detected, the new SW installs, the banner appears, and the
   user presses Update to reload with all new files from the new cache.
   Making index.html network-first caused the version number (in the <meta> tag)
   to update silently on every page load before the banner appeared, giving the
   impression of an automatic update. */
const NETWORK_FIRST = [];

/* Install: cache all app files — individual failures are caught so one
   missing or temporarily unavailable file doesn't abort the whole install */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE.map(url => cache.add(url).catch(err => {
        console.warn('[SW] Failed to cache:', url, err);
      })))
    )
    // Do NOT call skipWaiting() here — wait for user to press Update
  );
});

/* Activate: delete ALL old caches. Do NOT call clients.claim() here —
   claim() fires controllerchange on every open tab immediately, causing
   a silent page reload before the user ever sees the update banner.
   The new SW will take control naturally on the next navigation. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
});

/* Message: page calls postMessage({type:'SKIP_WAITING'}) when user presses Update */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* Fetch handler — cache-first for all app files.
   Uses caches.open(CACHE_NAME) explicitly rather than caches.match() so each SW
   version ONLY serves files from its OWN cache. caches.match() searches all caches
   and can return a stale file from an old cache that hasn't been deleted yet —
   this caused the "clicked Update but still saw the old version" bug, because the
   old cache was still present during the brief window between skipWaiting and the
   activate handler finishing its cleanup. */
self.addEventListener('fetch', e => {
  // Skip non-GET and cross-origin requests (e.g. Google Fonts, NET Bible API)
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        if (cached) return cached;
        // Not in our cache yet — fetch from network and cache it
        return fetch(e.request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(e.request, res.clone());
          }
          return res;
        });
      })
    )
  );
});
