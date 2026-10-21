/*
 * Service worker klienta mezičasů (/{locale}/mezicasy, #121).
 * Stránka se otevře i bez signálu (network-first, záloha z cache) a statické soubory
 * Next.js se berou z cache. API (/api/*) se nikdy necachuje – fronta zápisů je v IndexedDB.
 */
const CACHE = "mcvv-mezicasy-v1";

self.addEventListener("install", (event) => {
  // stránka klienta (scope) hned do cache, ať jde otevřít i bez signálu
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new URL(self.registration.scope).pathname))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

// Stránka po registraci pošle seznam už načtených statických souborů (JS/CSS chunků).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache" || !Array.isArray(data.urls)) return;
  const urls = data.urls
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith("/api/"));
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          urls.map((url) =>
            cache
              .match(url.pathname.startsWith("/_next/") ? url.href : url.pathname)
              .then((hit) =>
                hit
                  ? undefined
                  : cache
                      .add(url.pathname.startsWith("/_next/") ? url.href : url.pathname)
                      .catch(() => undefined),
              ),
          ),
        ),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && /^\/(cs|en)\/mezicasy\/?$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
