/* Signal Terminal service worker.
   - App shell (index.html, manifest, icons): network-first, cached copy only as an offline fallback.
   - Charting library (versioned CDN URL, immutable): cache-first.
   - Exchange APIs (OKX, Gate.io): NOT intercepted and never cached, so market data is always live or visibly failing. */
const VERSION = 'signal-terminal-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
const LIB = 'https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';
const API_HOSTS = ['www.okx.com', 'okx.com', 'api.gateio.ws'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    try { await c.add(new Request(LIB, { mode: 'cors' })); } catch (err) { /* offline at install time: fetched later */ }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (API_HOSTS.includes(url.hostname)) return;                    // live market data: straight to the network, never cached
  if (url.href === LIB) {                                            // immutable versioned library: cache-first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {                             // app shell: network-first, refresh the cache
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
