/*
  Service worker.

  Chrome will not offer to install a site without one that handles `fetch`, so
  its first job is to exist. Its second is to be careful: this app is entirely
  live data behind a session, and a worker that caches enthusiastically is a
  worker that serves one player another player's page, or a room that ended an
  hour ago.

  So the rule is narrow. Only `/_next/static/*` is cached, and only that:

    - those files are content-hashed, so a given URL's bytes never change and a
      cache hit can never be stale;
    - everything else — every API call, every HTML document, every image from
      the CDN — goes to the network untouched, and is not even intercepted.

  There is deliberately no offline page. The app cannot do anything useful
  without the API, so pretending otherwise would only replace a clear browser
  error with a screen that looks like the app is broken.
*/

const CACHE = 'bb-static-v1';

self.addEventListener('install', (event) => {
  // Take over immediately rather than waiting for every tab to close; there is
  // nothing cached that an older worker could be mid-way through serving.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions of this worker.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that can change the server's state must never be replayed.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/_next/static/')) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Only store a complete, successful response — a 206 or an opaque error
      // would be served back later as if it were the real file.
      if (response.ok && response.status === 200) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
