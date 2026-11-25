// 岡山・廣島行程的離線快取。只控制 trip.html，不影響 repo 裡其他頁面。
const V = 'trip-v1';
const CORE = [
  'trip.html',
  'trip.webmanifest',
  'trip-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
const TILES = 'trip-tiles';
const MAX_TILES = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('trip-') && k !== V && k !== TILES).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    await Promise.all(keys.slice(0, keys.length - MAX_TILES + 200).map(k => c.delete(k)));
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 行程頁本身：先拿最新版，沒網路時用存好的
  if (req.mode === 'navigate' || url.pathname.endsWith('/trip.html')) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(V).then(c => c.put('trip.html', copy));
        return r;
      }).catch(() => caches.match('trip.html'))
    );
    return;
  }

  // 地圖圖磚：看過的就存起來，之後先用存的
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const r = await fetch(req.url, { mode: 'cors' });
        if (r.ok) { c.put(req.url, r.clone()); trimTiles(); }
        return r;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    }));
    return;
  }

  // Leaflet、字型等：先用存的，背景更新
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.origin === location.origin) {
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
