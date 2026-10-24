import { updateMatch } from './matchUpStore.js';
import type { ScoreUpdate } from './types.js';
import type { Namespace } from 'socket.io';

/**
 * Record a score frame as the match's current state (so a later `/live` subscriber is replayed it) and fan
 * it out to every listener that can want it: the match room, the tournament room, and `all` (dashboards).
 *
 * One path for every producer — a tracker's frame and a promoted crowd session's — so a listener cannot tell
 * them apart by delivery, only by the frame's `source`.
 */
export function broadcastLiveScore(listeners: Namespace, update: ScoreUpdate): void {
  updateMatch(update);
  listeners.to(update.matchUpId).emit('score', update);
  if (update.tournamentId) listeners.to(`tournament:${update.tournamentId}`).emit('score', update);
  listeners.to('all').emit('score', update);
}
