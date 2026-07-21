import { Server, Socket } from 'socket.io';
import {
  updateMatch,
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
import {
  extractTrackerToken,
  TrackerAuthError,
  verifyTrackerToken,
  type TrackerSocketData,
} from './trackerAuth.js';
import { TrackerLimits } from './trackerLimits.js';
import { ConnectLimits } from './connectLimits.js';
import type { ScoreUpdate, MatchHistory, RelayConfig, RelayMetrics } from './types.js';

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
    ? connectUpstream(config.upstreamRelayUrl)
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

  tracker.on('connection', (socket: Socket) => {
    trackerCount++;
    const socketData = socket.data as TrackerSocketData;
    console.log(`[tracker] connected: ${socket.id} user=${socketData.userId} aud=${socketData.audience} (${trackerCount} active)`);

    socket.on('score', (data: ScoreUpdate) => {
      if (!guardFrame(socket, data, trackerLimits)) return;

      updateMatch(data);
      scoresRelayed++;
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Fan out to all listeners subscribed to this match
      listeners.to(data.matchUpId).emit('score', data);

      // Fan out to tournament room if tournamentId is present
      if (data.tournamentId) {
        listeners.to(`tournament:${data.tournamentId}`).emit('score', data);
      }

      // Also emit to the "all" room for dashboards
      listeners.to('all').emit('score', data);

      // Anchor clock ticks from the score event if it carries clock
      // fields. This is the reliable baseline — the intennse event
      // has richer data but may not always be sent.
      const anyData = data as any;
      const boltMs = typeof anyData.boltTimerRemainingMs === 'number' ? anyData.boltTimerRemainingMs : undefined;
      const serveMs = typeof anyData.serveClockRemainingMs === 'number' ? anyData.serveClockRemainingMs : undefined;
      if (boltMs !== undefined) {
        const status = ((data as any).matchUpStatus ?? '').toUpperCase();
        const running = boltMs > 0 && status !== 'COMPLETED';
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
    socket.on('intennse', (data: any) => {
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
      const status = (data.matchUpStatus ?? '').toUpperCase();
      const running = boltMs > 0 && status !== 'COMPLETED';

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
    socket.on('clockSync', (data: any) => {
      // clockSync ownership-checked but not rate-limited — there are
      // never more than a handful per match (pause/resume/break), and
      // rate-limiting them would risk dropping a transition.
      if (!guardOwnership(socket, data)) {
        socket.emit('error', { message: 'matchUpId required or tournament-mismatch' });
        return;
      }

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

    socket.on('history', async (data: MatchHistory) => {
      // history is the final-state event — ownership-checked, but
      // rate-limit-exempt because it fires at most once per match.
      if (!guardOwnership(socket, data)) {
        socket.emit('error', { message: 'matchUpId required or tournament-mismatch' });
        return;
      }

      setMatchHistory(data);
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Persist to factory server if configured
      await persistMatchHistory(data);

      // Notify listeners
      listeners.to(data.matchUpId).emit('history', data);

      forward?.('history', data);
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
    socket.on('subscribe', (matchUpId: string) => {
      socket.join(matchUpId);

      // Send current state if available
      const match = getMatch(matchUpId);
      if (match) {
        socket.emit('score', match.lastUpdate);
      }
    });

    // Unsubscribe from a match
    socket.on('unsubscribe', (matchUpId: string) => {
      socket.leave(matchUpId);
    });

    // Subscribe to all matches for a tournament
    socket.on('subscribe:tournament', (tournamentId: string) => {
      socket.join(`tournament:${tournamentId}`);

      // Send all current matches for this tournament
      const matches = getMatchUpsByTournament(tournamentId);
      for (const update of matches) {
        socket.emit('score', update);
      }
    });

    socket.on('unsubscribe:tournament', (tournamentId: string) => {
      socket.leave(`tournament:${tournamentId}`);
    });

    // Subscribe to all score updates (for dashboards/schedule views)
    socket.on('subscribe:all', () => {
      socket.join('all');

      // Send list of active matches
      socket.emit('active', getActiveMatchIds());
    });

    socket.on('unsubscribe:all', () => {
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
 * Ownership-only check, no rate limit. Used for clockSync and history
 * which are low-frequency transitions that shouldn't be dropped under
 * rate pressure.
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
  if (!data?.matchUpId) return false;
  const socketData = socket.data as TrackerSocketData | undefined;
  if (socketData?.audience === 'score' && socketData.tournamentId) {
    if (data.tournamentId && data.tournamentId !== socketData.tournamentId) return false;
    data.tournamentId = socketData.tournamentId;
  }
  return true;
}
