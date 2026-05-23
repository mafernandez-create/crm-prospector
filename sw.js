/* CRM Prospector · Service Worker v2 (rediseño)
 *
 * Estrategia network-first con fallback a caché. Borra cachés viejas
 * (v1 del CRM antiguo) al activar para que los usuarios con PWA instalada
 * vean el rediseño tras el primer refresh.
 */
const CACHE_NAME = 'crm-prospector-v8';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(function (n) { return n !== CACHE_NAME; })
        .map(function (n) { return caches.delete(n); })
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  // Solo cacheamos GET de mismo origen para no interferir con Firestore/GAS
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(function (r) {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE_NAME)
            .then(function (c) { return c.put(e.request, copy); })
            .catch(function () { /* ignore */ });
        }
        return r;
      })
      .catch(function () { return caches.match(e.request); })
  );
});
