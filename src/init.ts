import { app, restoreAppState, setOrientation, updateAppState } from './state/env';
import { configureViz, orientationEvent, vizUpdate } from './display/configureViz';
import { connectListener, onRelayStatusChange, type RelayStatus } from './services/messaging/scoreRelay';
import { setInitialState } from './config/initialState';
import { setDev } from './services/helpers/setDev';
import { registerEvents } from './events/registerEvents';
import { touchManager } from './events/touchManager';
import { defineActionEvents } from './events/events';
import { registerDefaultSkins } from './scoring';
import { registerDefaultProfiles } from './decorations';
import { cModal } from 'courthive-components';
import clipboard from 'clipboard';
import { tools } from 'tods-competition-factory';

export function init() {
  registerDefaultSkins();
  registerDefaultProfiles();
  setDev();

  window.addEventListener(
    'orientationchange',
    function () {
      orientationEvent();
    },
    false,
  );
  window.addEventListener(
    'resize',
    function () {
      orientationEvent();
    },
    false,
  );

  const queryString: any = {};
  const query = window.location.search.substring(1);
  const vars = query.split('&');
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    if (typeof queryString[pair[0]] === 'undefined') {
      queryString[pair[0]] = pair[1];
    } else if (typeof queryString[pair[0]] === 'string') {
      const arr = [queryString[pair[0]], pair[1]];
      queryString[pair[0]] = arr;
    } else {
      queryString[pair[0]].push(pair[1]);
    }
  }
  history.replaceState('', document.title, window.location.pathname + window.location.hash);

  touchManager.disableDrag();
  registerEvents();

  // dismiss notification of requirements
  const welcomeEl = document.getElementById('welcome');
  if (welcomeEl) welcomeEl.style.display = 'none';

  // initialize clipboard
  const clip = new clipboard('.c2c');
  clip.on('success', () => {
    cModal.close();
  });

  restoreAppState();
  checkUserUUID();
  // Broadcast disabled - not needed for standalone app
  // if (app.broadcast && navigator.onLine) startBroadcast();

  defineActionEvents();

  setOrientation();
  configureViz();
  vizUpdate();

  // Broadcasting/key functionality removed
  // if (queryString.key) {
  //   setTimeout(() => sendKey({ key: queryString.key }), 1000);
  // }

  setInitialState();

  // Connect to score relay for live score updates
  connectListener();
  createRelayIndicator();
}

function createRelayIndicator() {
  const el = document.createElement('div');
  el.id = 'relay-indicator';
  el.style.cssText = [
    'position: fixed',
    'top: 8px',
    'right: 8px',
    'z-index: 9999',
    'display: flex',
    'align-items: center',
    'gap: 6px',
    'font-size: 11px',
    'padding: 3px 8px',
    'border-radius: 12px',
    'background: rgba(239, 68, 68, 0.15)',
    'color: var(--ep-page-text-muted, #888)',
    'pointer-events: none',
    'transition: opacity 0.3s',
  ].join('; ');

  const dot = document.createElement('span');
  dot.style.cssText = 'width: 6px; height: 6px; border-radius: 50%; background: #ef4444; flex-shrink: 0;';

  const label = document.createElement('span');
  label.textContent = 'Connecting...';

  el.appendChild(dot);
  el.appendChild(label);
  document.body.appendChild(el);

  const update = (status: RelayStatus) => {
    if (status === 'connected') {
      dot.style.background = '#22c55e';
      label.textContent = 'Relay';
      el.style.background = 'rgba(34, 197, 94, 0.15)';
      // Fade out after 3 seconds when connected
      setTimeout(() => { el.style.opacity = '0'; }, 3000);
    } else if (status === 'connecting') {
      dot.style.background = '#f59e0b';
      label.textContent = 'Connecting...';
      el.style.background = 'rgba(245, 158, 11, 0.15)';
      el.style.opacity = '1';
    } else if (status === 'error') {
      dot.style.background = '#ef4444';
      label.textContent = 'Relay offline';
      el.style.background = 'rgba(239, 68, 68, 0.15)';
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
    }
  };

  onRelayStatusChange(update);
}

function checkUserUUID() {
  if (!app.user_uuid) {
    app.user_uuid = tools.UUID();
    updateAppState();
  }
}

