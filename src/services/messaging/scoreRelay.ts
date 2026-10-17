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

/** Audiences the relay's /tracker accepts. */
const TRACKER_AUDIENCES = new Set(['admin', 'score']);

/** A token's audiences, read the way the relay reads them: absent or empty means `admin`. */
function tokenAudiences(aud: unknown): string[] {
  if (aud === undefined || aud === null || aud === '') return ['admin'];
  if (typeof aud === 'string') return [aud];
  if (Array.isArray(aud)) {
    const named = aud.filter((value): value is string => typeof value === 'string' && value.length > 0);
    return named.length ? named : ['admin'];
  }
  return [];
}

/**
 * The tracker handshake credential: the signed-in user's JWT, read afresh at
 * every (re)connect so a login or token refresh is picked up. A relay with a
 * secret but strict mode off admits a socket with no token, yet refuses one
 * whose token fails verification, so only a token it would accept is sent:
 * unexpired, with an `admin` or `score` audience. The storage key is shared
 * across courthive.net, and a HiveID sign-in on courthive-public leaves a
 * `hiveid`-only token there; that scorer connects without one, as before.
 */
function trackerAuth(): Record<string, string> {
  const token = browserStorage.get(getJwtTokenStorageKey());
  if (!token || token === 'undefined') return {};
  try {
    const { exp, aud } = jwtDecode(token);
    if (typeof exp === 'number' && exp <= Date.now() / 1000) return {};
    if (!tokenAudiences(aud).some((audience) => TRACKER_AUDIENCES.has(audience))) return {};
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

// Last point number forwarded per matchUp, for a caller that sends only the
// latest point: a `point` is emitted once per scored point even though the scoring
// UI re-broadcasts on many non-point transitions (timeout, challenge,
// substitution, exit). courthive-query also dedups monotonically by pointNumber as
// the safety net across reloads/handoffs (this in-memory map resets on reload).
// See MATCHUP_HISTORY_PERSISTENCE.md (S5b).
const lastSentPointNumber = new Map<string, number>();

// For a caller that sends the full point array: one key per point last sent, in
// order. Points are numbered by position, so comparing the arrays tells a new
// point from a re-broadcast and from a correction (an undo, an edit, a removal).
const sentPointKeys = new Map<string, string[]>();

type PointChange = 'first' | 'same' | 'append' | 'correction';

function pointKey(point: any): string {
  const p = point ?? {};
  return JSON.stringify([
    p.winner,
    p.server,
    p.winningSide,
    p.serverSideNumber,
    p.serverParticipantId,
    p.result,
    p.code,
    p.hand,
    p.stroke,
    p.rallyLength,
  ]);
}

function classifyPoints(previous: string[] | undefined, next: string[]): PointChange {
  if (!previous) return 'first';
  const unchangedPrefix = previous.every((key, i) => key === next[i]);
  if (unchangedPrefix && next.length === previous.length) return 'same';
  if (unchangedPrefix && next.length === previous.length + 1) return 'append';
  return 'correction';
}

/**
 * Record the scorer's current point array and, when it corrects points already
 * sent, send it whole so the relay replaces the durable history. The first array
 * seen for a matchUp in this page session is taken as the baseline: it cannot
 * be told apart from a resume. Returns what changed.
 */
export function syncPoints(sync: {
  matchUpId: string;
  tournamentId?: string;
  matchUpFormat?: string;
  points: any[];
}): PointChange {
  const keys = sync.points.map(pointKey);
  const change = classifyPoints(sentPointKeys.get(sync.matchUpId), keys);
  sentPointKeys.set(sync.matchUpId, keys);
  if (change === 'correction') {
    const correction = {
      matchUpId: sync.matchUpId,
      tournamentId: sync.tournamentId,
      matchUpFormat: sync.matchUpFormat,
      points: sync.points,
    };
    if (logEmit) console.log('[scoreRelay] emit correctPoints:', correction);
    connectTracker().emit('correctPoints', correction);
  }
  return change;
}

export function sendScore(update: {
  matchUpId: string;
  tournamentId?: string;
  matchUpFormat?: string;
  score: any;
  point?: any;
  /** The full point array. When given, `point` is sent only for a new point, and a correction is sent whole. */
  points?: any[];
  matchUpStatus?: string;
  winningSide?: number;
}): void {
  const tracker = connectTracker();
  const { points, ...frame } = update;
  let payload: Record<string, any> = frame;
  if (points) {
    const change = syncPoints({ ...frame, points });
    if (change !== 'append' && change !== 'first') payload = withoutPoint(frame);
  } else if (frame.point) {
    // Forward `point` only when it is a NEW, identifiable point for this matchUp;
    // otherwise strip it so the relay/store don't append a duplicate.
    const pointNumber = typeof frame.point.pointNumber === 'number' ? frame.point.pointNumber : undefined;
    if (pointNumber === undefined || lastSentPointNumber.get(frame.matchUpId) === pointNumber) {
      payload = withoutPoint(frame);
    } else {
      lastSentPointNumber.set(frame.matchUpId, pointNumber);
    }
  }
  if (logEmit) console.log('[scoreRelay] emit score:', payload);
  tracker.emit('score', payload);
}

function withoutPoint<T extends { point?: any }>(frame: T): Omit<T, 'point'> {
  const { point: _omit, ...rest } = frame;
  return rest;
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
