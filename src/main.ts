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
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).toString();
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('[epixodic] service worker registration failed', err);
    });
  });
}
