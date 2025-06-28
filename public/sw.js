const CACHE_NAME = 'uploads-cache-v1';
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', event => {
  const { type, urls } = event.data || {};
  if (type === 'cache-uploads' && Array.isArray(urls)) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => Promise.all(
        urls.map(url => cache.match(url).then(res => {
          if (!res) {
            return fetch(url).then(resp => {
              if (resp.ok) cache.put(url, resp.clone());
            });
          }
        }))
      ))
    );
  }
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => cache.match(event.request).then(res => {
        if (res) return res;
        return fetch(event.request).then(resp => {
          if (resp.ok) cache.put(event.request, resp.clone());
          return resp;
        });
      }))
    );
  }
});
