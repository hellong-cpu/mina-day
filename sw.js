/* 미나의 하루 / 우리 집 service worker: 화면 파일과 폰트·SDK만 캐시. 데이터(Firestore, 로그인) 요청은 통과. */
const CACHE = 'mina-day-v27';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png?v=3', './apple-touch-icon.png?v=3',
               './us/', './us/index.html', './us/manifest.webmanifest', './us/icon-192.png?v=1', './us/apple-touch-icon.png?v=1'];
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com', 'cdn.jsdelivr.net'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mina-day-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (!same && !STATIC_HOSTS.includes(url.hostname)) return;
  if (!same && url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
  if (req.mode === 'navigate' || (same && (url.pathname.endsWith('/') || url.pathname.endsWith('.html')))) {
    const key = url.origin + url.pathname.replace(/index\.html$/, '');
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(key, c)); return r; })
      .catch(() => caches.match(key).then(h => h || caches.match(url.pathname.includes('/us/') ? './us/' : './'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
});
/* 폰 알림: 서버(GitHub Actions)가 FCM으로 보낸 데이터를 알림으로 띄움 */
self.addEventListener('push', e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = Object.assign({}, j.notification || {}, j.data || {}); } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '미나의 하루';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', tag: d.tag || undefined, icon: './icon-192.png?v=3', badge: './icon-192.png?v=3', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope) && !x.url.includes('/us/'));
    return c ? c.focus().then(w => w && w.navigate ? w.navigate(url) : w) : self.clients.openWindow(url);
  }));
});
