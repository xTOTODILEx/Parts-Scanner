// Lets the app open without internet after the first visit.
const CACHE = 'bad-part-finder-v8';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'parts.js', 'inventory.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's own cache, so a new version never stores old files.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App files: use the network when online so updates show up, fall back to cache offline.
    // cache: 'no-cache' checks with the server every time; otherwise the browser may keep using
    // files it saved earlier (GitHub Pages allows 10 minutes), and updates seem not to arrive.
    const fresh = new Request(req.url, {
      cache: 'no-cache',
      credentials: 'same-origin',
      redirect: req.mode === 'navigate' ? 'manual' : 'follow',
    });
    e.respondWith(fetch(fresh).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
  } else if (url.hostname.endsWith('jsdelivr.net') || url.hostname.endsWith('tessdata.projectnaptha.com')) {
    // Libraries and OCR language data never change for a pinned version: cache first.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
