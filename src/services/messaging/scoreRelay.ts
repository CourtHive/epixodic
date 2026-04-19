import { io, Socket } from 'socket.io-client';

/**
 * Determine the relay server origin and Socket.IO path.
 *
 * Local dev: relay runs on a separate port (8384), default `/socket.io/` path.
 * Deployed: same origin, nginx proxies `/relay/` to the relay server,
 *   so Socket.IO path must be `/relay/socket.io/` for the proxy to route it.
 */
function getRelayConfig(): { origin: string; path: string } {
  if (import.meta.env.VITE_RELAY_URL) {
    return { origin: import.meta.env.VITE_RELAY_URL, path: '/socket.io/' };
  }

  const hostname = globalThis.location?.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return { origin: 'http://localhost:8384', path: '/socket.io/' };
  }

  return { origin: globalThis.location.origin, path: '/relay/socket.io/' };
}

const relayConfig = getRelayConfig();

let trackerSocket: Socket | null = null;
let listenerSocket: Socket | null = null;

// --- Connection status ---

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

let statusValue: RelayStatus = 'disconnected';
const statusListeners = new Set<(status: RelayStatus) => void>();

function setStatus(s: RelayStatus) {
  if (s === statusValue) return;
  statusValue = s;
  for (const fn of statusListeners) fn(s);
}

export function getRelayStatus(): RelayStatus {
  return statusValue;
}

export function onRelayStatusChange(fn: (status: RelayStatus) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

// Suppress repeated error logging — log once per disconnect cycle
let errorLogged = false;

// ── Toggleable logging ──
let logAck = false;
let logEmit = false;

export function setRelayLogAck(on: boolean) { logAck = on; }
export function setRelayLogEmit(on: boolean) { logEmit = on; }
export function getRelayLogFlags() { return { logAck, logEmit }; }

function attachStatusHandlers(socket: Socket, label: string) {
  socket.on('connect', () => {
    errorLogged = false;
    setStatus('connected');
    console.log(`[scoreRelay] ${label} connected`);
  });

  socket.on('disconnect', () => {
    setStatus('disconnected');
    console.log(`[scoreRelay] ${label} disconnected`);
  });

  socket.on('connect_error', (err) => {
    setStatus('error');
    if (!errorLogged) {
      console.warn(`[scoreRelay] ${label} connection error: ${err.message}`);
      errorLogged = true;
    }
  });

  socket.io.on('reconnect_attempt', () => {
    setStatus('connecting');
  });
}

// --- Tracker connection (for sending scores from epixodic as a mobile tracker) ---

export function connectTracker(): Socket {
  if (trackerSocket?.connected) return trackerSocket;

  trackerSocket = io(`${relayConfig.origin}/tracker`, {
    path: relayConfig.path,
    transports: ['websocket'],
    autoConnect: true,
  });

  attachStatusHandlers(trackerSocket, 'tracker');

  trackerSocket.on('ack', (data: any) => {
    if (logAck) console.log('[scoreRelay] ack:', data);
  });

  return trackerSocket;
}

export function sendScore(update: {
  matchUpId: string;
  tournamentId?: string;
  score: any;
  point?: any;
  matchUpStatus?: string;
  winningSide?: number;
}): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  if (logEmit) console.log('[scoreRelay] emit score:', update);
  trackerSocket?.emit('score', update);
}

export function sendHistory(history: {
  matchUpId: string;
  tournamentId?: string;
  provider?: string;
  matchUpFormat?: string;
  points: any[];
  score?: any;
  sides?: any[];
}): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  if (logEmit) console.log('[scoreRelay] emit history:', history);
  trackerSocket?.emit('history', history);
}

/**
 * Send a lightweight clock-state sync to the relay so it can pause,
 * resume, or re-anchor its ticker without waiting for the next score
 * event. Fired on officialPause, timeout, break, navigation away —
 * any transition that changes the bolt clock state without scoring.
 */
export function sendClockSync(data: {
  matchUpId: string;
  tournamentId?: string;
  boltTimerRemainingMs: number;
  serveClockRemainingMs: number;
  /** Which clock is the active countdown: bolt (normal play),
   *  timeout (60s team timeout), break (between-bolts), or none. */
  activeClock?: 'bolt' | 'timeout' | 'break' | 'none';
  /** Remaining ms on the active secondary clock (timeout or break). */
  activeClockRemainingMs?: number;
  /** Whether the serve clock is actively counting down.
   *  False during a rally (serve clock paused, bolt still running). */
  serveClockRunning?: boolean;
  /** 'running' | 'paused' | 'completed' */
  clockState: string;
}): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  if (logEmit) console.log('[scoreRelay] emit clockSync:', data);
  trackerSocket?.emit('clockSync', data);
}

/**
 * Broadcast enriched INTENNSE update with per-player stats, aggregate scores,
 * penalty box state, and clock data. External displays subscribe to these
 * for rich scoreboard rendering.
 */
export function sendIntennseUpdate(snapshot: any): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  if (logEmit) console.log('[scoreRelay] emit intennse:', snapshot);
  trackerSocket?.emit('intennse', snapshot);
}

// --- Listener connection (for receiving live scores as a display/dashboard) ---

export function connectListener(): Socket {
  if (listenerSocket?.connected) return listenerSocket;

  listenerSocket = io(`${relayConfig.origin}/live`, {
    path: relayConfig.path,
    transports: ['websocket'],
    autoConnect: true,
  });

  attachStatusHandlers(listenerSocket, 'listener');

  return listenerSocket;
}

export function subscribeToMatch(
  matchUpId: string,
  onScore: (update: any) => void,
  onHistory?: (history: any) => void,
): () => void {
  const socket = connectListener();

  socket.emit('subscribe', matchUpId);
  socket.on('score', onScore);
  if (onHistory) socket.on('history', onHistory);

  // Return unsubscribe function
  return () => {
    socket.emit('unsubscribe', matchUpId);
    socket.off('score', onScore);
    if (onHistory) socket.off('history', onHistory);
  };
}

export function subscribeToAll(
  onScore: (update: any) => void,
  onActive?: (matchIds: string[]) => void,
): () => void {
  const socket = connectListener();

  socket.emit('subscribe:all');
  socket.on('score', onScore);
  if (onActive) socket.on('active', onActive);

  return () => {
    socket.emit('unsubscribe:all');
    socket.off('score', onScore);
    if (onActive) socket.off('active', onActive);
  };
}

export function disconnectAll(): void {
  trackerSocket?.disconnect();
  listenerSocket?.disconnect();
  trackerSocket = null;
  listenerSocket = null;
  setStatus('disconnected');
}
