/* Epixodic service worker — minimal shell for PWA installability.
 *
 * Strategy:
 *   - navigation requests: network-first, fall back to cached app shell when offline.
 *   - same-origin static assets (JS/CSS/fonts/images): stale-while-revalidate.
 *   - cross-origin requests: pass through.
 *
 * CACHE_VERSION is replaced at build time with the build commit short-SHA
 * (see vite.config.ts `stampServiceWorkerVersion`). Each prod build emits
 * a different SW byte stream and a different SHELL_CACHE name, so:
 *   1. Browsers detect the SW change and install + activate the new worker.
 *   2. The activate handler's existing sweep deletes the previous
 *      `epixodic-shell-*` cache so stale JS/CSS hashes don't linger.
 * Without the stamp the cache key was the literal string 'v1', which
 * never changed across deploys and could trap users on old assets until
 * they manually cleared site data.
 */

const CACHE_VERSION = '__EPIXODIC_BUILD_COMMIT__';
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
