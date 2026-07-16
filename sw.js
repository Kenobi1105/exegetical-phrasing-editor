/* ════════════════════════════════════════
   SERVICE WORKER — Exegetical Phrasing Editor
   Auto cache-busting: bump APP_VERSION on each deploy
════════════════════════════════════════ */
const APP_VERSION = '202607161200';
const CACHE_NAME  = 'exeg-app-v' + APP_VERSION;

/* sw.js and index.html are intentionally excluded from PRECACHE.
   sw.js  — must never be cached by the SW itself; the browser always
            fetches it directly from the network so version changes are
            detected on every page load. Caching it here would cause the
            old SW to serve the old sw.js forever, breaking all future
            update detection.
   index.html — served network-first (see fetch handler below) so a fresh
            load always gets the latest shell, which re-registers the
            latest sw.js. Falls back to cache when offline. */
const PRECACHE = [
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

/* URLs that must be served network-first, falling back to cache offline.
   sw.js is not listed here either — the browser handles it natively. */
const NETWORK_FIRST = [
  './index.html',
  './',
];

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

/* Fetch handler — two strategies:
   1. NETWORK-FIRST for index.html and './' — always try the network so the
      page shell and sw.js registration stay fresh. Falls back to cache if
      offline. This is what lets the browser detect sw.js changes on F5.
   2. CACHE-FIRST for everything else (app.css, app.js, data/*.json, etc.) —
      fast loads from cache; network fill-in for anything not yet cached. */
self.addEventListener('fetch', e => {
  // Skip non-GET and cross-origin requests (e.g. Google Fonts, NET Bible API)
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const isNetworkFirst = NETWORK_FIRST.some(p => {
    const norm = new URL(p, self.location).pathname.replace(/\/$/, '') || '/';
    return pathname === norm;
  });

  if (isNetworkFirst) {
    // Network-first: fresh response when online, cached fallback when offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first: instant load from cache, network fill-in for misses
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
  }
});
