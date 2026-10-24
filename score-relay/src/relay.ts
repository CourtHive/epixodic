import { Server, Socket } from 'socket.io';
import {
  setMatchHistory,
  getMatch,
  getActiveMatchIds,
  getMatchUpsByTournament,
  pruneStaleMatches,
  setClockAnchor,
  getClockAnchor,
  setClockTimer,
  clearClockTimer,
} from './matchUpStore.js';
import { connectUpstream } from './upstreamFederation.js';
import { persistMatchHistory } from './persistence.js';
import { persistPoint, persistPointCorrection } from './pointHistoryPersistence.js';
import {
  extractTrackerToken,
  TrackerAuthError,
  verifyTrackerToken,
  type TrackerSocketData,
} from './trackerAuth.js';
import { TrackerLimits } from './trackerLimits.js';
import { ConnectLimits } from './connectLimits.js';
import { broadcastLiveScore } from './liveBroadcast.js';
import type { ScoreUpdate, MatchHistory, PointsCorrection, RelayConfig, RelayMetrics } from './types.js';

/** Far above any match's point count, so the cap only bounds a hostile frame. */
const MAX_CORRECTION_POINTS = 5000;

// Metrics counters
let trackerCount = 0;
let listenerCount = 0;
let scoresRelayed = 0;
const startTime = Date.now();

export function getMetrics(): RelayMetrics {
  return {
    trackers: trackerCount,
    listeners: listenerCount,
    activeMatches: getActiveMatchIds().length,
    scoresRelayed,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  };
}

export function createRelay(io: Server, config: RelayConfig): void {
  const staleMatchAgeMs = config.staleMatchHours * 60 * 60 * 1000;
  const pruneIntervalMs = config.pruneIntervalMinutes * 60 * 1000;
  const tickerIdleMs = (config.tickerIdleTimeoutSeconds ?? 1800) * 1000;

  // Upstream federation: forward tracker events to the cloud relay
  const forward = config.upstreamRelayUrl
    ? connectUpstream(config.upstreamRelayUrl, config.upstreamRelayToken)
    : null;

  // --- Tracker namespace: mobile trackers push scores here ---
  const tracker = io.of('/tracker');

  // Per-IP connect-rate cap. Runs BEFORE token validation so a flood
  // of bad-token connects can't dominate the auth path either. The
  // default ceiling (60/min) is well above any legitimate reconnect
  // storm; abuse looks like hundreds.
  const connectLimits = new ConnectLimits({
    maxConnectsPerMinute: config.trackerMaxConnectsPerMinute ?? 60,
  });
  setInterval(() => connectLimits.prune(), pruneIntervalMs).unref();

  tracker.use((socket, next) => {
    const ip = socket.handshake.address || 'unknown';
    if (!connectLimits.tryConnect(ip)) {
      console.warn(`[tracker] reject ${socket.id}: connect-rate-limited (ip=${ip})`);
      next(new Error('connect-rate-limited'));
      return;
    }
    next();
  });

  // Auth + ownership gate. Transitional during the IONSport rollout —
  // see types.ts RelayConfig.trackerJwtSecret / trackerRequireAuth.
  tracker.use((socket, next) => {
    const token = extractTrackerToken(socket);
    if (!config.trackerJwtSecret) {
      // Legacy permissive mode — relay was deployed without a secret.
      (socket.data as TrackerSocketData) = { userId: 'anonymous', audience: 'admin' };
      next();
      return;
    }
    if (!token) {
      if (config.trackerRequireAuth) {
        console.warn(`[tracker] reject ${socket.id}: missing-token`);
        next(new Error('missing-token'));
        return;
      }
      console.warn(`[tracker] DEPRECATED: ${socket.id} connected without token; tighten before IONSport go-live`);
      (socket.data as TrackerSocketData) = { userId: 'anonymous', audience: 'admin' };
      next();
      return;
    }
    try {
      (socket.data as TrackerSocketData) = verifyTrackerToken(token, config.trackerJwtSecret, {
        es256Keys: config.es256Keys,
      });
      next();
    } catch (err) {
      const reason = err instanceof TrackerAuthError ? err.reason : 'bad-token';
      console.warn(`[tracker] reject ${socket.id}: ${reason}`);
      next(new Error(reason));
    }
  });

  // Per-matchUp + per-user rate limits. The per-user ceiling (default
  // 5× the per-matchUp cap) closes the cross-matchUp fan-out bypass.
  const trackerLimits = new TrackerLimits({
    eventsPerSecond: config.trackerMaxEventsPerSecond ?? 10,
    userFanoutMultiplier: config.trackerUserFanoutMultiplier ?? 5,
  });
  // Prune idle buckets on the same cadence as stale matches. `.unref()`
  // so the timer doesn't keep Node alive on SIGTERM — the relay process
  // is expected to exit cleanly without `--force-exit` during deploys.
  setInterval(() => trackerLimits.prune(), pruneIntervalMs).unref();

  // clockSync and history used to be exempt from rate limiting because a
  // well-behaved tracker sends few of them; nothing obliges a client to be
  // well-behaved. They get their own bucket, at the same rate, so a burst of
  // score frames can never starve a clock transition and vice versa.
  const controlLimits = new TrackerLimits({
    eventsPerSecond: config.trackerMaxEventsPerSecond ?? 10,
    userFanoutMultiplier: config.trackerUserFanoutMultiplier ?? 5,
  });
  setInterval(() => controlLimits.prune(), pruneIntervalMs).unref();

  // One canonical persistence per match at a time; frames that arrive while it
  // runs collapse to the latest, so repeated history frames cannot launch
  // unbounded work against CFS.
  const persistHistoryLatest = latestOnlyPerKey<MatchHistory>((history) => persistMatchHistory(history));

  tracker.on('connection', (socket: Socket) => {
    trackerCount++;
    const socketData = socket.data as TrackerSocketData;
    console.log(`[tracker] connected: ${socket.id} user=${socketData.userId} aud=${socketData.audience} (${trackerCount} active)`);

    onFrame(socket, 'score', (data: ScoreUpdate) => {
      if (!guardFrame(socket, data, trackerLimits)) return;

      // Record + fan out to the match, tournament and `all` rooms (the same path a promoted crowd session takes).
      broadcastLiveScore(listeners, { ...data, source: 'tracker' });
      scoresRelayed++;
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Durably persist the point to courthive-query (S3). Fire-and-forget — a
      // persistence failure must never block the broadcast/ack path above.
      if (data.point) persistPoint(data);

      // Anchor clock ticks from the score event if it carries clock
      // fields. This is the reliable baseline — the intennse event
      // has richer data but may not always be sent.
      const anyData = data as any;
      const boltMs = typeof anyData.boltTimerRemainingMs === 'number' ? anyData.boltTimerRemainingMs : undefined;
      const serveMs = typeof anyData.serveClockRemainingMs === 'number' ? anyData.serveClockRemainingMs : undefined;
      if (boltMs !== undefined) {
        const running = boltMs > 0 && readStatus(data) !== 'COMPLETED';
        setClockAnchor(data.matchUpId, {
          boltRemainingMs: boltMs,
          serveRemainingMs: serveMs ?? 0,
          anchoredAt: Date.now(),
          running,
          activeClock: running ? 'bolt' : 'none',
          serveClockRunning: true,
          tournamentId: data.tournamentId,
        });
        if (running) {
          startClockTicker(data.matchUpId, listeners);
        } else {
          clearClockTimer(data.matchUpId);
        }
      }

      forward?.('score', data);
    });

    // INTENNSE enriched snapshots: fan out to listeners + anchor clocks
    // for relay-native tick generation.
    onFrame(socket, 'intennse', (data: any) => {
      if (!guardFrame(socket, data, trackerLimits)) return;
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Fan out the event payload (full stats, score, penalty box, etc.)
      listeners.to(data.matchUpId).emit('intennse', data);
      if (data.tournamentId) {
        listeners.to(`tournament:${data.tournamentId}`).emit('intennse', data);
      }
      listeners.to('all').emit('intennse', data);

      // Anchor clocks for relay-native tick generation.
      // The intennse event carries boltTimerRemainingMs and
      // serveClockRemainingMs — snapshot values at the moment the
      // tracker emitted. Between events, the relay extrapolates by
      // subtracting wall-clock elapsed time from the anchor.
      const matchUpId = data.matchUpId;
      const boltMs = typeof data.boltTimerRemainingMs === 'number' ? data.boltTimerRemainingMs : 0;
      const serveMs = typeof data.serveClockRemainingMs === 'number' ? data.serveClockRemainingMs : 0;
      const running = boltMs > 0 && readStatus(data) !== 'COMPLETED';

      setClockAnchor(matchUpId, {
        boltRemainingMs: boltMs,
        serveRemainingMs: serveMs,
        anchoredAt: Date.now(),
        running,
        activeClock: running ? 'bolt' : 'none',
        serveClockRunning: true,
        tournamentId: data.tournamentId,
      });

      if (running) {
        startClockTicker(matchUpId, listeners);
      } else {
        clearClockTimer(matchUpId);
      }

      forward?.('intennse', data);
    });

    // Clock state sync — lightweight event fired when the bolt clock
    // pauses/resumes/completes WITHOUT a point being scored (official
    // pause, timeout, break, navigation away). Re-anchors or stops
    // the relay's ticker so the scorebug display matches reality.
    onFrame(socket, 'clockSync', (data: any) => {
      if (!guardFrame(socket, data, controlLimits)) return;

      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      const boltMs = typeof data.boltTimerRemainingMs === 'number' ? data.boltTimerRemainingMs : 0;
      const serveMs = typeof data.serveClockRemainingMs === 'number' ? data.serveClockRemainingMs : 0;
      const activeClock = data.activeClock ?? (data.clockState === 'running' ? 'bolt' : 'none');
      const running = data.clockState === 'running';

      // serveClockRunning defaults to true unless explicitly false
      // (rally in progress → serve clock paused while bolt keeps running)
      const serveClockRunning = data.serveClockRunning !== false;

      setClockAnchor(data.matchUpId, {
        boltRemainingMs: boltMs,
        serveRemainingMs: serveMs,
        anchoredAt: Date.now(),
        running,
        activeClock,
        serveClockRunning,
        activeClockRemainingMs: typeof data.activeClockRemainingMs === 'number' ? data.activeClockRemainingMs : undefined,
        tournamentId: data.tournamentId,
      });

      if (running) {
        startClockTicker(data.matchUpId, listeners);
      } else {
        clearClockTimer(data.matchUpId);
      }

      // Fan out to listeners so display clients know the clock state changed
      listeners.to(data.matchUpId).emit('clockSync', data);
      if (data.tournamentId) {
        listeners.to(`tournament:${data.tournamentId}`).emit('clockSync', data);
      }
      listeners.to('all').emit('clockSync', data);

      forward?.('clockSync', data);
    });

    onFrame(socket, 'history', (data: MatchHistory) => {
      if (!guardFrame(socket, data, controlLimits)) return;

      setMatchHistory(data);
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Listeners first: persistence is a durable side effect and must not
      // delay the live broadcast.
      listeners.to(data.matchUpId).emit('history', data);
      forward?.('history', data);

      // Canonical persistence writes to CFS under the RELAY's service
      // identity, so it is only ever done on behalf of a verified principal.
      // An anonymous socket (permissive mode) gets fan-out, never a write.
      if (socketData.userId === 'anonymous') {
        console.warn(`[tracker] ${socket.id}: anonymous history for ${data.matchUpId} not persisted`);
        return;
      }
      persistHistoryLatest(data.matchUpId, data);
    });

    // A scorer's authoritative point array, after an undo, an edit or a removal
    // changed points already sent. It REPLACES the durable history, so unlike an
    // append (which courthive-query's monotonic dedup bounds) it is accepted only
    // from a verified principal.
    onFrame(socket, 'correctPoints', (data: PointsCorrection) => {
      if (!guardFrame(socket, data, controlLimits)) return;
      if (!isPointArray(data.points)) {
        socket.emit('error', { message: 'invalid-frame' });
        return;
      }
      if (socketData.userId === 'anonymous') {
        socket.emit('rejected', { matchUpId: data.matchUpId, reason: 'unauthenticated' });
        return;
      }
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });
      forward?.('correctPoints', data);
      persistPointCorrection(data);
    });

    socket.on('disconnect', () => {
      trackerCount--;
      console.log(`[tracker] disconnected: ${socket.id} (${trackerCount} active)`);
    });
  });

  // --- Listener namespace: TMX, scoreboards, epixodic displays subscribe here ---
  const listeners = io.of('/live');

  listeners.on('connection', (socket: Socket) => {
    listenerCount++;
    console.log(`[live] connected: ${socket.id} (${listenerCount} active)`);

    // Subscribe to score updates for a specific match
    onFrame(socket, 'subscribe', (matchUpId: string) => {
      if (!isId(matchUpId)) return;
      socket.join(matchUpId);

      // Send current state if available
      const match = getMatch(matchUpId);
      if (match) {
        socket.emit('score', match.lastUpdate);
      }
    });

    // Unsubscribe from a match
    onFrame(socket, 'unsubscribe', (matchUpId: string) => {
      if (!isId(matchUpId)) return;
      socket.leave(matchUpId);
    });

    // Subscribe to all matches for a tournament
    onFrame(socket, 'subscribe:tournament', (tournamentId: string) => {
      if (!isId(tournamentId)) return;
      socket.join(`tournament:${tournamentId}`);

      // Send all current matches for this tournament
      const matches = getMatchUpsByTournament(tournamentId);
      for (const update of matches) {
        socket.emit('score', update);
      }
    });

    onFrame(socket, 'unsubscribe:tournament', (tournamentId: string) => {
      if (!isId(tournamentId)) return;
      socket.leave(`tournament:${tournamentId}`);
    });

    // Subscribe to all score updates (for dashboards/schedule views)
    onFrame(socket, 'subscribe:all', () => {
      socket.join('all');

      // Send list of active matches
      socket.emit('active', getActiveMatchIds());
    });

    onFrame(socket, 'unsubscribe:all', () => {
      socket.leave('all');
    });

    socket.on('disconnect', () => {
      listenerCount--;
      console.log(`[live] disconnected: ${socket.id} (${listenerCount} active)`);
    });
  });

  // ── Relay-native clock ticker ─────────────────────────────
  //
  // Instead of the competition-factory-server generating 10Hz HTTP
  // POSTs, the relay itself extrapolates from the last-received
  // intennse event's clock values. Each event re-anchors the
  // countdown (corrects any drift). Pause/break/complete signals
  // clear the timer.

  function startClockTicker(matchUpId: string, ns: typeof listeners): void {
    // Idempotent — clears any existing timer for this match first.
    clearClockTimer(matchUpId);

    // .unref() the 10 Hz clock ticker so leftover running anchors at
    // SIGTERM don't keep Node alive past graceful shutdown. The ticker
    // is auto-cleared when the clock completes, but a relay restart in
    // the middle of an active match must not hang waiting for that.
    const timer = setInterval(() => {
      const anchor = getClockAnchor(matchUpId);
      if (!anchor?.running) {
        clearClockTimer(matchUpId);
        return;
      }

      const elapsed = Date.now() - anchor.anchoredAt;

      // Idle timeout: if no intennse event has re-anchored this match
      // for longer than the configured threshold, the tracker is
      // presumed disconnected or the match abandoned. Stop ticking.
      if (elapsed > tickerIdleMs) {
        console.log(`[relay] ticker idle timeout for ${matchUpId} (${Math.round(elapsed / 1000)}s since last anchor)`);
        clearClockTimer(matchUpId);
        return;
      }

      const boltMs = Math.max(0, anchor.boltRemainingMs - elapsed);
      // Freeze serve clock when it's not running (e.g. rally in progress)
      const serveMs = anchor.serveClockRunning
        ? Math.max(0, anchor.serveRemainingMs - elapsed)
        : anchor.serveRemainingMs;

      // For timeout/break clocks, extrapolate the secondary countdown.
      const activeClockMs = anchor.activeClockRemainingMs !== undefined
        ? Math.max(0, anchor.activeClockRemainingMs - elapsed)
        : undefined;

      const tickPayload = {
        kind: 'tick' as const,
        matchUpId,
        activeClock: anchor.activeClock,
        boltTimerRemainingMs: boltMs,
        serveClockRemainingMs: serveMs,
        // Only include the secondary clock when it's the active one.
        ...(anchor.activeClock === 'timeout' && activeClockMs !== undefined
          ? { timeoutRemainingMs: activeClockMs } : {}),
        ...(anchor.activeClock === 'break' && activeClockMs !== undefined
          ? { breakRemainingMs: activeClockMs } : {}),
        generatedAt: new Date().toISOString(),
      };

      ns.to(matchUpId).emit('scorebug-tick', tickPayload);
      if (anchor.tournamentId) {
        ns.to(`tournament:${anchor.tournamentId}`).emit('scorebug-tick', tickPayload);
      }
      ns.to('all').emit('scorebug-tick', tickPayload);

      // Auto-stop when the active clock reaches zero. The next event
      // from epixodic (clockSync or score) will re-anchor if play
      // continues (e.g. bolt-expired → break starts).
      const activeDone =
        (anchor.activeClock === 'bolt' && boltMs <= 0) ||
        (anchor.activeClock === 'timeout' && (activeClockMs ?? 0) <= 0) ||
        (anchor.activeClock === 'break' && (activeClockMs ?? 0) <= 0);
      if (activeDone) {
        clearClockTimer(matchUpId);
      }
    }, 100); // 10 Hz
    timer.unref();

    setClockTimer(matchUpId, timer);
  }

  // Periodically prune stale matches (also clears any orphaned timers).
  // `.unref()` so the relay process exits cleanly on SIGTERM without
  // needing `--force-exit` — see also the rate-limit-prune timer above.
  setInterval(() => {
    const pruned = pruneStaleMatches(staleMatchAgeMs);
    if (pruned > 0) {
      console.log(`[relay] pruned ${pruned} stale matches`);
    }
  }, pruneIntervalMs).unref();
}

/**
 * Validate matchUpId presence + tournament ownership (for score-aud
 * tokens) and consume one rate-limit token. Returns true to proceed;
 * on failure, the socket has already been signaled and the caller
 * should just `return`.
 *
 * Passes the token's `userId` into the limiter so the per-user
 * fan-out ceiling kicks in — the per-matchUp bucket alone leaves a
 * bypass where N matchUps × per-match cap = N× total throughput.
 */
function guardFrame(
  socket: Socket,
  data: { matchUpId?: string; tournamentId?: string } | undefined,
  limits: TrackerLimits,
): boolean {
  if (!guardOwnership(socket, data)) {
    socket.emit('error', { message: 'matchUpId required or tournament-mismatch' });
    return false;
  }
  // Shape-check before any state changes: a frame that would fail later in the
  // handler must not be half-applied (stored and fanned out) first.
  readStatus(data as { matchUpStatus?: unknown });
  const socketData = socket.data as TrackerSocketData | undefined;
  const limit = limits.tryConsume(data!.matchUpId!, socketData?.userId);
  if (!limit.allowed) {
    socket.emit('rejected', {
      matchUpId: data!.matchUpId,
      reason: limit.scope === 'user' ? 'user-rate-limited' : 'rate-limited',
      retryAfter: limit.retryAfter,
    });
    return false;
  }
  return true;
}

/**
 * Shape + ownership check, no rate limit (the caller picks the bucket).
 *
 * For `score`-audience tokens, the tournament binding lives in the JWT,
 * not the frame. If the frame omits `tournamentId`, we stamp the token's
 * value onto the frame so downstream persistence and fan-out are scoped
 * to that tournament — otherwise an omit-tournamentId frame would slip
 * the mismatch check and reach `listeners.to('all')` as if global.
 */
function guardOwnership(
  socket: Socket,
  data: { matchUpId?: string; tournamentId?: string } | undefined,
): boolean {
  if (!data || typeof data !== 'object' || !isId(data.matchUpId)) return false;
  if (data.tournamentId !== undefined && !isId(data.tournamentId)) return false;
  const socketData = socket.data as TrackerSocketData | undefined;
  if (socketData?.audience === 'score' && socketData.tournamentId) {
    if (data.tournamentId && data.tournamentId !== socketData.tournamentId) return false;
    data.tournamentId = socketData.tournamentId;
  }
  return true;
}

function isPointArray(value: unknown): value is PointsCorrection['points'] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_CORRECTION_POINTS &&
    value.every((point) => !!point && typeof point === 'object' && !Array.isArray(point))
  );
}

class InvalidFrameError extends Error {}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** A frame's matchUpStatus, upper-cased. Absent reads as ''; anything but a string is a malformed frame. */
function readStatus(data: { matchUpStatus?: unknown }): string {
  const status = data.matchUpStatus;
  if (status === undefined || status === null) return '';
  if (typeof status !== 'string') throw new InvalidFrameError('matchUpStatus must be a string');
  return status.toUpperCase();
}

/**
 * Register a socket handler behind an error boundary. Socket.IO 4 dispatches
 * handlers inside `process.nextTick`, so a throw there is an uncaught exception
 * that ends the relay: one malformed frame from any client would restart it.
 */
function onFrame<T>(socket: Socket, event: string, handler: (data: T) => unknown): void {
  socket.on(event, (data: T) => {
    try {
      const result = handler(data);
      if (result instanceof Promise) result.catch((err) => reportFrameError(socket, event, err));
    } catch (err) {
      reportFrameError(socket, event, err);
    }
  });
}

function reportFrameError(socket: Socket, event: string, err: unknown): void {
  const invalid = err instanceof InvalidFrameError;
  if (!invalid) console.error(`[relay] ${event} handler failed for ${socket.id}:`, err);
  socket.emit('error', { message: 'invalid-frame' });
}

/**
 * Run `task` for at most one value per key at a time. A value that arrives while
 * its key is busy replaces any value already waiting, and runs when the current
 * one settles, so the work per key is bounded at one running plus one waiting.
 */
export function latestOnlyPerKey<T>(task: (value: T) => Promise<unknown>): (key: string, value: T) => void {
  const running = new Set<string>();
  const waiting = new Map<string, T>();

  const run = (key: string, value: T): void => {
    running.add(key);
    task(value)
      .catch((err) => console.error(`[relay] persistence failed for ${key}:`, err))
      .finally(() => {
        running.delete(key);
        const next = waiting.get(key);
        if (next !== undefined) {
          waiting.delete(key);
          run(key, next);
        }
      });
  };

  return (key, value) => {
    if (running.has(key)) waiting.set(key, value);
    else run(key, value);
  };
}
