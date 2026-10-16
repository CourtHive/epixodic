import { getJwtTokenStorageKey } from '../../config/getJwtTokenStorageKey';
import { browserStorage } from '../../state/browserStorage';
import { io, Socket } from 'socket.io-client';
import { jwtDecode } from 'jwt-decode';

/**
 * Determine the relay server origin and Socket.IO path.
 *
 * Local dev: relay runs on a separate port (8384), default `/socket.io/` path.
 * Deployed: same origin, nginx proxies `/relay/` to the relay server,
 *   so Socket.IO path must be `/relay/socket.io/` for the proxy to route it.
 */
export function getRelayConfig(): { origin: string; path: string } {
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

/** How long to wait before retrying a handshake the relay refused. */
const HANDSHAKE_RETRY_MS = 5_000;

/**
 * The tracker handshake credential: the signed-in user's JWT, read afresh at
 * every (re)connect so a login or token refresh is picked up. Only an unexpired
 * token is sent: a relay with a secret but strict mode off admits a socket with
 * no token, yet refuses one whose token fails verification.
 */
function trackerAuth(): Record<string, string> {
  const token = browserStorage.get(getJwtTokenStorageKey());
  if (!token || token === 'undefined') return {};
  try {
    const { exp } = jwtDecode(token);
    if (typeof exp === 'number' && exp <= Date.now() / 1000) return {};
  } catch {
    return {};
  }
  return { token };
}

/**
 * The tracker socket. One instance for the module's lifetime (until
 * `disconnectAll`): Socket.IO reconnects it and buffers emits while it is down,
 * so a frame sent while it is connecting must reuse it, not build another.
 */
export function connectTracker(): Socket {
  if (trackerSocket) return trackerSocket;

  const socket = io(`${relayConfig.origin}/tracker`, {
    path: relayConfig.path,
    transports: ['websocket'],
    autoConnect: true,
    auth: (cb) => cb(trackerAuth()),
  });
  trackerSocket = socket;

  attachStatusHandlers(socket, 'tracker');

  // A refusal by the relay's auth middleware leaves the socket inactive, and
  // Socket.IO does not retry it. Retry on a delay; the handshake re-reads the
  // token, so an expired one is dropped and a fresh login is used.
  socket.on('connect_error', () => {
    if (socket.active) return;
    setTimeout(() => {
      if (trackerSocket === socket && !socket.connected) socket.connect();
    }, HANDSHAKE_RETRY_MS);
  });

  socket.on('ack', (data: any) => {
    if (logAck) console.log('[scoreRelay] ack:', data);
  });

  return socket;
}

// Last point number forwarded per matchUp — so a `point` is emitted once per
// scored point even though the scoring UI re-broadcasts on many non-point
// transitions (timeout, challenge, substitution, exit). courthive-query also
// dedups monotonically by pointNumber as the safety net across reloads/handoffs
// (this in-memory map resets on reload). See MATCHUP_HISTORY_PERSISTENCE.md (S5b).
const lastSentPointNumber = new Map<string, number>();

export function sendScore(update: {
  matchUpId: string;
  tournamentId?: string;
  score: any;
  point?: any;
  matchUpStatus?: string;
  winningSide?: number;
}): void {
  const tracker = connectTracker();
  // Forward `point` only when it is a NEW, identifiable point for this matchUp;
  // otherwise strip it so the relay/store don't append a duplicate.
  let payload = update;
  const pointNumber = typeof update.point?.pointNumber === 'number' ? update.point.pointNumber : undefined;
  if (update.point) {
    if (pointNumber === undefined || lastSentPointNumber.get(update.matchUpId) === pointNumber) {
      const { point: _omit, ...rest } = update;
      payload = rest;
    } else {
      lastSentPointNumber.set(update.matchUpId, pointNumber);
    }
  }
  if (logEmit) console.log('[scoreRelay] emit score:', payload);
  tracker.emit('score', payload);
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
  const tracker = connectTracker();
  if (logEmit) console.log('[scoreRelay] emit history:', history);
  tracker.emit('history', history);
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
  const tracker = connectTracker();
  if (logEmit) console.log('[scoreRelay] emit clockSync:', data);
  tracker.emit('clockSync', data);
}

/**
 * Broadcast enriched INTENNSE update with per-player stats, aggregate scores,
 * penalty box state, and clock data. External displays subscribe to these
 * for rich scoreboard rendering.
 */
export function sendIntennseUpdate(snapshot: any): void {
  const tracker = connectTracker();
  if (logEmit) console.log('[scoreRelay] emit intennse:', snapshot);
  tracker.emit('intennse', snapshot);
}

// --- Listener connection (for receiving live scores as a display/dashboard) ---

type ScoreCallback = (update: any) => void;
interface MatchSubscriber {
  onScore: ScoreCallback;
  onHistory?: (history: any) => void;
}
interface AllSubscriber {
  onScore: ScoreCallback;
  onActive?: (matchIds: string[]) => void;
}

// Room membership belongs to a Socket.IO connection and is lost on reconnect, so
// the registry is the source of truth and every `connect` rejoins from it.
const matchSubscribers = new Map<string, Set<MatchSubscriber>>();
const allSubscribers = new Set<AllSubscriber>();

function rejoinRooms(socket: Socket): void {
  for (const matchUpId of matchSubscribers.keys()) socket.emit('subscribe', matchUpId);
  if (allSubscribers.size) socket.emit('subscribe:all');
}

// One dispatcher per event, routing by matchUpId: a callback per subscription
// on the shared socket would hand every subscriber every joined match's frames.
function dispatchScore(update: any): void {
  for (const subscriber of matchSubscribers.get(update?.matchUpId) ?? []) subscriber.onScore(update);
  for (const subscriber of allSubscribers) subscriber.onScore(update);
}

function dispatchHistory(history: any): void {
  for (const subscriber of matchSubscribers.get(history?.matchUpId) ?? []) subscriber.onHistory?.(history);
}

function dispatchActive(matchIds: string[]): void {
  for (const subscriber of allSubscribers) subscriber.onActive?.(matchIds);
}

export function connectListener(): Socket {
  if (listenerSocket) return listenerSocket;

  const socket = io(`${relayConfig.origin}/live`, {
    path: relayConfig.path,
    transports: ['websocket'],
    autoConnect: true,
  });
  listenerSocket = socket;

  attachStatusHandlers(socket, 'listener');
  socket.on('connect', () => rejoinRooms(socket));
  socket.on('score', dispatchScore);
  socket.on('history', dispatchHistory);
  socket.on('active', dispatchActive);

  return socket;
}

export function subscribeToMatch(
  matchUpId: string,
  onScore: (update: any) => void,
  onHistory?: (history: any) => void,
): () => void {
  const socket = connectListener();
  const subscriber: MatchSubscriber = { onScore, onHistory };

  let subscribers = matchSubscribers.get(matchUpId);
  if (!subscribers) {
    subscribers = new Set();
    matchSubscribers.set(matchUpId, subscribers);
    // A socket that is not yet connected joins in its `connect` handler.
    if (socket.connected) socket.emit('subscribe', matchUpId);
  }
  subscribers.add(subscriber);

  return () => {
    const current = matchSubscribers.get(matchUpId);
    if (!current?.delete(subscriber) || current.size) return;
    matchSubscribers.delete(matchUpId);
    if (listenerSocket?.connected) listenerSocket.emit('unsubscribe', matchUpId);
  };
}

export function subscribeToAll(
  onScore: (update: any) => void,
  onActive?: (matchIds: string[]) => void,
): () => void {
  const socket = connectListener();
  const subscriber: AllSubscriber = { onScore, onActive };

  if (!allSubscribers.size && socket.connected) socket.emit('subscribe:all');
  allSubscribers.add(subscriber);

  return () => {
    if (!allSubscribers.delete(subscriber) || allSubscribers.size) return;
    if (listenerSocket?.connected) listenerSocket.emit('unsubscribe:all');
  };
}

export function disconnectAll(): void {
  trackerSocket?.disconnect();
  listenerSocket?.disconnect();
  trackerSocket = null;
  listenerSocket = null;
  matchSubscribers.clear();
  allSubscribers.clear();
  setStatus('disconnected');
}
