import './styles/theme.css';
import './styles/epixodic.css';
import './styles/swipeList.css';
import './styles/icons.css';
import './styles/intennse.css';
import { init } from './init';
import { router as enhancedRouter } from './router/enhancedRouter';

// Set up router before init so page components are available

(window as any).appRouter = enhancedRouter;

// Initialize app first
init();

// Start router after init — will restore match from URL or browserStorage
enhancedRouter.start();

// Register PWA service worker in production (HTTPS or localhost only).
// Two-part update flow so end users never have to "Clear site data":
//   1. When the registered SW finds a new worker waiting (different bytes
//      because each build stamps a unique CACHE_VERSION — see vite.config.ts),
//      we post SKIP_WAITING so the new worker activates immediately instead
//      of sitting idle until every tab closes.
//   2. When the active worker actually changes (controllerchange), we reload
//      once so the fresh JS/CSS bundles load through the new worker. The
//      `reloaded` guard prevents the classic infinite-reload loop where
//      controllerchange fires again mid-reload.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).toString();
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        const promptUpdate = (worker: ServiceWorker | null) => {
          if (worker && worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage('SKIP_WAITING');
          }
        };
        promptUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => promptUpdate(installing));
        });
      })
      .catch((err) => {
        console.warn('[epixodic] service worker registration failed', err);
      });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
