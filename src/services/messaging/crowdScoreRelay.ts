/**
 * crowdScoreRelay — bridge epixodic's scoring flow to the `/crowd` producer,
 * but only when epixodic was launched with a HiveID scorer identity
 * (crowd-scoring Phase D). No identity → no-op, so normal epixodic scoring is
 * unaffected.
 *
 * A stable per-matchUp sessionId accumulates points into one crowd session, so
 * the relay's optimistic versioning + TMX's classifyScorer/Accept see a single
 * evolving session (identical to courthive-public inline scoring).
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

/** Whether this epixodic session was launched to crowd-score as a HiveID person. */
export function isCrowdScoringLaunch(): boolean {
  return !!getCrowdScorerIdentity()?.token;
}

/**
 * Relay the current score to `/crowd` as the launched-with scorer. No-op unless
 * a scorer identity is present. Never throws.
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

  submitCrowdScore({
    token: identity.token,
    sessionId: `epx-crowd-${args.matchUpId}`,
    matchUpId: args.matchUpId,
    tournamentId: args.tournamentId,
    clientId: getClientId(),
    point: args.point,
    currentScore: args.currentScore,
    formatHint: args.formatHint,
    scorer: { personId: identity.personId, displayName: identity.displayName, audience: 'hiveid' },
  });
}
