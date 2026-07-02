/* ════════════════════════════════════════
   SERVICE WORKER — Exegetical Phrasing Editor
   Auto cache-busting: bump APP_VERSION on each deploy
════════════════════════════════════════ */
const APP_VERSION = '202607020215';
const CACHE_NAME  = 'exeg-app-v' + APP_VERSION;

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

/* Install: cache all app files */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
    // Do NOT call skipWaiting() here — wait for user to press Update
  );
});

/* Activate: delete ALL old caches, then take control */
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
    ).then(() => self.clients.claim())
  );
});

/* Message: page calls postMessage({type:'SKIP_WAITING'}) when user presses Update */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* Fetch: serve from cache, fall back to network */
self.addEventListener('fetch', e => {
  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

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
});
