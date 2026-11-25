const V = 'factor-v22';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/app.js', 'js/db.js', 'js/util.js', 'js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js', 'fonts/Vazirmatn-Regular.woff2', 'fonts/Vazirmatn-Medium.woff2', 'fonts/Vazirmatn-Bold.woff2', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(hit => hit || fetch(r).catch(() => (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
