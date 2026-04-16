import { Server, Socket } from 'socket.io';
import {
  updateMatch,
  setMatchHistory,
  getMatch,
  getActiveMatchIds,
  getMatchUpsByTournament,
  pruneStaleMatches,
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
    });

    // INTENNSE enriched snapshots: fan out to listeners without storing
    socket.on('intennse', (data: any) => {
      if (!data?.matchUpId) {
        socket.emit('error', { message: 'matchUpId required' });
        return;
      }

      socket.emit('ack', { matchUpId: data.matchUpId, received: true });

      listeners.to(data.matchUpId).emit('intennse', data);
      if (data.tournamentId) {
        listeners.to(`tournament:${data.tournamentId}`).emit('intennse', data);
      }
      listeners.to('all').emit('intennse', data);
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

  // Periodically prune stale matches
  setInterval(() => {
    const pruned = pruneStaleMatches(staleMatchAgeMs);
    if (pruned > 0) {
      console.log(`[relay] pruned ${pruned} stale matches`);
    }
  }, pruneIntervalMs);
}
