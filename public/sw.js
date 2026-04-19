/* Epixodic service worker — minimal shell for PWA installability.
 *
 * Strategy:
 *   - navigation requests: network-first, fall back to cached app shell when offline.
 *   - same-origin static assets (JS/CSS/fonts/images): stale-while-revalidate.
 *   - cross-origin requests: pass through.
 *
 * The cache name is bumped whenever this file changes so old clients roll over
 * on the next activate. Keep the logic minimal — Epixodic's real caching story
 * lives in the app, this SW exists so Chrome/Android/iOS treat the site as a
 * real PWA and honour `display: standalone`.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `epixodic-shell-${CACHE_VERSION}`;
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('epixodic-') && k !== SHELL_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networked = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || networked;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
