/**
 * Promoted crowd sessions on `/live`.
 *
 * A TD promotes a crowd session to make it the feed they follow. Until this module, promotion only set
 * `trusted` in the crowd store, and the only reader was TMX's REST poll — so arena scoreboards and any
 * other `/live` listener never saw it, and TMX saw it a poll late. Now a promoted session's score goes out
 * exactly as a tracker's does (`broadcastLiveScore`): on promotion, and on every point appended after.
 *
 * Only `trusted` + `active` sessions are published; an unpromoted crowd score is never broadcast as live.
 * Demoting or cancelling retracts the stored frame — but only when that session produced it, so a tracker's
 * frame for the same match is never dropped by a crowd demotion.
 *
 * Neither call throws. Both run after the thing they follow has already succeeded (a point acked, a promote
 * saved); a broadcast failure must not turn that success into an error for the caller.
 */
import { getMatch, removeMatch } from '../matchUpStore.js';
import { broadcastLiveScore } from '../liveBroadcast.js';
import type { CrowdScoringSession } from './types.js';
import type { ScoreUpdate } from '../types.js';
import type { Namespace } from 'socket.io';

export interface TrustedCrowdFanout {
  /** Publish the session's current score if it is promoted and active; a no-op otherwise. */
  publish: (session: CrowdScoringSession) => void;
  /** Forget the session's frame (demoted / cancelled) so later subscribers are not replayed it. */
  retract: (session: Pick<CrowdScoringSession, 'sessionId' | 'matchUpId'>) => void;
}

/** The `/live` frame for a promoted, active session — or undefined when it must not be broadcast. */
export function crowdSessionToScoreUpdate(session: CrowdScoringSession): ScoreUpdate | undefined {
  if (!session?.trusted || session.status !== 'active') return undefined;
  const current = session.currentScore;
  if (!current || !Array.isArray(current.sets)) return undefined;
  const update: ScoreUpdate = {
    matchUpId: session.matchUpId,
    tournamentId: session.tournamentId,
    score: { sets: current.sets },
    matchUpStatus: current.winningSide ? 'COMPLETED' : 'IN_PROGRESS',
    source: 'crowd',
    sessionId: session.sessionId,
  };
  if (session.formatHint) update.matchUpFormat = session.formatHint;
  if (current.winningSide) update.winningSide = current.winningSide;
  return update;
}

export function createTrustedCrowdFanout(
  listeners: Namespace,
  logger: (message: string) => void = (m) => console.warn(`[crowd-fanout] ${m}`),
): TrustedCrowdFanout {
  const contained = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      logger(`${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return {
    publish: (session) =>
      contained(`publish ${session?.sessionId}`, () => {
        const update = crowdSessionToScoreUpdate(session);
        if (update) broadcastLiveScore(listeners, update);
      }),
    retract: (session) =>
      contained(`retract ${session?.sessionId}`, () => {
        const held = getMatch(session.matchUpId)?.lastUpdate;
        if (held?.source === 'crowd' && held.sessionId === session.sessionId) removeMatch(session.matchUpId);
      }),
  };
}
