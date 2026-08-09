const VERSION = 'athletic-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-private-pages`;
const STATIC_CACHE = `${VERSION}-static`;
const SHELL = ['/offline', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const PRIVATE_OFFLINE_ROUTES = ['/hoy', '/training'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => ![SHELL_CACHE, PAGE_CACHE, STATIC_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_PRIVATE_CACHE') {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const isPrivateRoute = PRIVATE_OFFLINE_ROUTES.some((route) => url.pathname.startsWith(route));
        if (response.ok && !response.redirected && isPrivateRoute) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const privateCache = await caches.open(PAGE_CACHE);
        const exact = await privateCache.match(request);
        if (exact) return exact;
        const routeMatch = PRIVATE_OFFLINE_ROUTES.find((route) => url.pathname.startsWith(route));
        if (routeMatch) {
          const routeResponse = await privateCache.match(routeMatch);
          if (routeResponse) return routeResponse;
        }
        return (await caches.match('/offline')) || Response.error();
      }
    })());
  }
});

