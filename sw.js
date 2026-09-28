// オフライン用：アプリ本体をキャッシュする。ファイルを更新したら VERSION を上げる。
const VERSION = 'v2';
const FILES = ['./', 'index.html', 'style.css', 'db.js', 'price-provider.js', 'scanner.js', 'app.js',
  'manifest.json', 'vendor/zxing-reader.js', 'vendor/zxing_reader.wasm', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
