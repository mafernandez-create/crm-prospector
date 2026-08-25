/* CRM Prospector · Service Worker v10 (rediseño)
 *
 * IMPORTANTE: este SW NO cachea los scripts/HTML del rediseño para evitar
 * el problema observado el 2026-05-23 — un SW antiguo siguió sirviendo
 * data.js cacheado tras varios deploys, bloqueando los fixes.
 *
 * Reglas:
 *   - HTML, JS, CSS del rediseño → siempre red (network-only). Si falla,
 *     y la petición es una navegación (documento), se sirve offline.html.
 *   - Recursos terceros (fuentes Google, CDN Leaflet/XLSX) → cache-first
 *     porque son inmutables por URL.
 *   - Firestore / GAS → pasan tal cual (no se interceptan).
 */
const CACHE_NAME = 'crm-prospector-v47';
const OFFLINE_URL = new URL('offline.html', self.location).href;

self.addEventListener('install', function (e) {
  // Precachea SOLO la página de fallback offline (no el shell: seguimos
  // network-only para HTML/JS/CSS y así nunca servimos código viejo).
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return c.add(OFFLINE_URL); })
      .catch(function () { /* si falla el precache, no bloquear la instalación */ })
  );
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

function isAppScript(url) {
  return (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/sw.js')
  );
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // No interceptar nada fuera del origen propio (Firestore, GAS, fuentes…)
  if (url.origin !== self.location.origin) return;

  // Scripts/HTML/CSS del rediseño → network-only.
  // Si la red falla, devolvemos el cache si existe; sin red ni cache, error
  // explícito al navegador (mejor que servir un asset desactualizado).
  if (isAppScript(url)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          if (hit) return hit;
          // Navegación (documento) sin red ni cache → página offline amigable
          // en vez del error genérico del navegador. Para JS/CSS, sin fallback.
          if (e.request.mode === 'navigate') return caches.match(OFFLINE_URL);
          return Response.error();
        });
      })
    );
    return;
  }

  // Resto de assets propios (imágenes, etc.) → cache-first
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (r) {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE_NAME)
            .then(function (c) { return c.put(e.request, copy); })
            .catch(function () { /* ignore */ });
        }
        return r;
      });
    })
  );
});
