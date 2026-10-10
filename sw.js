/* 미나의 하루 service worker: 화면 파일과 폰트·SDK만 캐시. 데이터 요청(Firestore, 로그인)은 건드리지 않음. */
const CACHE = 'mina-day-v8';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png?v=3', './icon-512.png?v=3', './apple-touch-icon.png?v=3'];
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com', 'cdn.jsdelivr.net'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (!same && !STATIC_HOSTS.includes(url.hostname)) return;           // Firestore·로그인 요청은 그대로 통과
  if (!same && url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
  if (req.mode === 'navigate' || (same && (url.pathname.endsWith('/') || url.pathname.endsWith('.html')))) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
});
