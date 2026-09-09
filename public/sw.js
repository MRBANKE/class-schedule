const CACHE_NAME = 'class-schedule-v7';
// manifest 故意不预缓存:它现在按当前页地址动态生成(start_url 带 ?id= 等参数),
// 缓存住任何一份都会让"添加到主屏幕"拿到别的页面的参数,或退回没有参数的主页
const APP_SHELL = ['/', '/index.html', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 数据现在全在服务端:/api/* 一律不缓存,否则改完课表/备忘刷新还是旧数据
  if (url.pathname.startsWith('/api/')) return;
  // manifest 每次都必须走网络拿到"当前页参数"的那一份,绝不能缓存或用缓存兜底
  if (url.pathname === '/manifest.webmanifest') return;
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/@react-refresh')) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => cached || caches.match('/index.html')),
      ),
  );
});
