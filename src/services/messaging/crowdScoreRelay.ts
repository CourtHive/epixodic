/**
 * crowdScoreRelay — bridge epixodic's scoring flow to the `/crowd` producer,
 * but only when epixodic was launched with a HiveID scorer identity
 * (crowd-scoring Phase D). No identity → no-op, so normal epixodic scoring is
 * unaffected.
 *
 * A stable per-scorer, per-matchUp sessionId accumulates points into one crowd
 * session, so the relay's optimistic versioning + TMX's classifyScorer/Accept
 * see a single evolving session per scorer (as courthive-public does).
 */

import { getCrowdScorerIdentity } from './crowdScorerIdentity';
import { submitCrowdScore } from './crowdRelay';

const CLIENT_ID_KEY = 'epixodic-crowd-client-id';
let clientId: string | undefined;

function getClientId(): string {
  if (clientId) return clientId;
  try {
    const existing = globalThis.localStorage?.getItem(CLIENT_ID_KEY);
    if (existing) {
      clientId = existing;
      return existing;
    }
  } catch {
    /* storage unavailable */
  }
  const cryptoObj: any = (globalThis as any).crypto;
  clientId = cryptoObj?.randomUUID ? `epx-${cryptoObj.randomUUID()}` : `epx-${globalThis.performance?.now?.() ?? ''}`;
  try {
    globalThis.localStorage?.setItem(CLIENT_ID_KEY, clientId);
  } catch {
    /* storage unavailable */
  }
  return clientId;
}

/**
 * The crowd session a scorer's points for one matchUp accumulate into.
 *
 * The relay binds a session to the user who created it and rejects anyone else
 * with `not-owner`, so the id must differ per scorer: a bare `epx-crowd-<matchUpId>`
 * let the first scorer of a matchUp lock out every other. Keyed on the scorer's
 * personId (stable across reloads and devices, so one person keeps one session),
 * falling back to this device's client id when the token carries none.
 */
export function crowdSessionId(matchUpId: string, scorerKey: string): string {
  return `epx-crowd-${scorerKey}-${matchUpId}`;
}

/** Whether this epixodic session was launched to crowd-score as a HiveID person. */
export function isCrowdScoringLaunch(): boolean {
  return !!getCrowdScorerIdentity()?.token;
}

/** The `/crowd` point: side numbers 1|2 where the engine's are 0|1. */
export interface CrowdPoint {
  winner: 1 | 2;
  server?: 1 | 2;
  result?: string;
  recordedAt: string;
}

/**
 * The one mapping from a scoring-engine point to a `CrowdPoint`. The engine's
 * `winner`/`server` are 0-based; the crowd protocol's are side numbers. A point
 * without a winner cannot be relayed (the relay rejects it), so it maps to none.
 */
export function toCrowdPoint(point: any): CrowdPoint | undefined {
  if (point?.winner !== 0 && point?.winner !== 1) return undefined;
  const crowdPoint: CrowdPoint = {
    winner: point.winner === 0 ? 1 : 2,
    recordedAt: typeof point.timestamp === 'string' ? point.timestamp : new Date().toISOString(),
  };
  if (point.server === 0 || point.server === 1) crowdPoint.server = point.server === 0 ? 1 : 2;
  if (typeof point.result === 'string') crowdPoint.result = point.result;
  return crowdPoint;
}

// The last pointNumber relayed per crowd session. The scoring UI re-broadcasts
// the score on transitions that add no point (timeouts, substitutions, exits);
// the crowd protocol is one frame per point, so those send nothing.
const lastRelayedPointNumber = new Map<string, number>();

/**
 * Relay a NEW point to `/crowd` as the launched-with scorer, with the score it
 * produced. No-op unless a scorer identity is present and `point` is a point not
 * yet relayed for this session. Never throws.
 *
 * Not expressible here (left to the TD, who accepts in TMX): a correction, i.e.
 * an undo or an edited earlier point. The crowd session only ever grows.
 */
export function relayCrowdScoreIfLaunched(args: {
  matchUpId?: string;
  tournamentId?: string;
  currentScore: any;
  point?: any;
  formatHint?: string;
}): void {
  const identity = getCrowdScorerIdentity();
  if (!identity?.token || !args.matchUpId) return;

  const crowdPoint = toCrowdPoint(args.point);
  const pointNumber = args.point?.pointNumber;
  if (!crowdPoint || typeof pointNumber !== 'number') return;

  const sessionId = crowdSessionId(args.matchUpId, identity.personId ?? getClientId());
  const last = lastRelayedPointNumber.get(sessionId);
  if (last !== undefined && pointNumber <= last) return;
  lastRelayedPointNumber.set(sessionId, pointNumber);

  submitCrowdScore({
    token: identity.token,
    sessionId,
    matchUpId: args.matchUpId,
    tournamentId: args.tournamentId,
    clientId: getClientId(),
    point: crowdPoint,
    currentScore: args.currentScore,
    formatHint: args.formatHint,
    scorer: { personId: identity.personId, displayName: identity.displayName, audience: 'hiveid' },
  });
}
