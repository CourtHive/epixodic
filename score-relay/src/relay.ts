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
import { persistMatchHistory } from './persistence.js';
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

  // --- Tracker namespace: mobile trackers push scores here ---
  const tracker = io.of('/tracker');

  tracker.on('connection', (socket: Socket) => {
    trackerCount++;
    console.log(`[tracker] connected: ${socket.id} (${trackerCount} active)`);

    socket.on('score', (data: ScoreUpdate) => {
      if (!data?.matchUpId) {
        socket.emit('error', { message: 'matchUpId required' });
        return;
      }

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
          tournamentId: data.tournamentId,
        });
        if (running) {
          startClockTicker(data.matchUpId, listeners);
        } else {
          clearClockTimer(data.matchUpId);
        }
      }
    });

    // INTENNSE enriched snapshots: fan out to listeners + anchor clocks
    // for relay-native tick generation.
    socket.on('intennse', (data: any) => {
      if (!data?.matchUpId) {
        socket.emit('error', { message: 'matchUpId required' });
        return;
      }

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
        tournamentId: data.tournamentId,
      });

      if (running) {
        startClockTicker(matchUpId, listeners);
      } else {
        clearClockTimer(matchUpId);
      }
    });

    socket.on('history', async (data: MatchHistory) => {
      if (!data?.matchUpId) {
        socket.emit('error', { message: 'matchUpId required' });
        return;
      }

      setMatchHistory(data);
      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      // Persist to factory server if configured
      await persistMatchHistory(data);

      // Notify listeners
      listeners.to(data.matchUpId).emit('history', data);
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
      const serveMs = Math.max(0, anchor.serveRemainingMs - elapsed);

      const tickPayload = {
        kind: 'tick' as const,
        matchUpId,
        boltTimerRemainingMs: boltMs,
        serveClockRemainingMs: serveMs,
        generatedAt: new Date().toISOString(),
      };

      // Fan out to match room, tournament room, and "all" room —
      // mirrors the intennse event fan-out so every subscriber type
      // (match-level, tournament-level, dashboard) receives ticks.
      ns.to(matchUpId).emit('scorebug-tick', tickPayload);
      if (anchor.tournamentId) {
        ns.to(`tournament:${anchor.tournamentId}`).emit('scorebug-tick', tickPayload);
      }
      ns.to('all').emit('scorebug-tick', tickPayload);

      // Auto-stop when the bolt clock reaches zero — the next
      // intennse event (bolt-expired) will formally signal completion.
      if (boltMs <= 0) {
        clearClockTimer(matchUpId);
      }
    }, 100); // 10 Hz

    setClockTimer(matchUpId, timer);
  }

  // Periodically prune stale matches (also clears any orphaned timers)
  setInterval(() => {
    const pruned = pruneStaleMatches(staleMatchAgeMs);
    if (pruned > 0) {
      console.log(`[relay] pruned ${pruned} stale matches`);
    }
  }, pruneIntervalMs);
}
