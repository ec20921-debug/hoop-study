// HOOP STUDY service worker — アプリ本体をスマホに保存してオフラインでも開けるようにする
const CACHE = 'hoop-v13';
const SHELL = ['./', './index.html', './style.css?v=13', './app.js?v=13', './data.js?v=13', './config.js?v=13', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/coach.jpg', './icons/coach-full.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 同じサイトのファイル: ネット優先（更新をすぐ反映）→ 圏外ならキャッシュ
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
