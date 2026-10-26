// HOOP STUDY service worker — アプリ本体をスマホに保存してオフラインでも開けるようにする
const CACHE = 'hoop-v17';
const SHELL = ['./', './index.html', './style.css?v=17', './app.js?v=17', './data.js?v=17', './config.js?v=17', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/coach.jpg', './icons/coach-full.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
// 古いキャッシュを消すのは HOOP のものだけ（同じサイトの STAR STUDY のキャッシュは消さない）
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hoop-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 同じサイトのファイル: ネット優先（更新をすぐ反映）→ 圏外ならキャッシュ
// ?fresh= つき（保護者画面が毎回最新を読む設定・問題データ）はキャッシュに入れない（開くたびにたまるため）
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.searchParams.has('fresh')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
