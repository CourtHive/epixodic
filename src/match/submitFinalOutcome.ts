import { browserStorage } from '../state/browserStorage';
import { getLoginState } from '../services/auth/loginState';
import { submitOfficialScore, type ScoreSubmitParams } from '../services/messaging/scoreSubmitApi';

/**
 * Authorized final-outcome submission for standard (non-team) tournament
 * matches scored locally (the scoring iframe / mobile route only persist to
 * localStorage). Live scores already flow via the score-relay unconditionally;
 * this pushes the FINAL outcome to the authoritative CFS tournament record —
 * but ONLY when the scorer is authenticated and the match is tournament-linked.
 *
 * Runs in the parent window (called from the scoring-modal close), so it uses
 * the parent's authenticated baseApi directly — no iframe round-trip.
 */

export type SubmitFinalOutcomeResult =
  | { status: 'submitted' }
  | { status: 'skipped'; reason: 'not-found' | 'incomplete' | 'unauthenticated' | 'not-tournament' }
  | { status: 'error'; error: string };

const FINAL_STATUSES = new Set(['COMPLETED', 'RETIRED', 'WALKOVER', 'DEFAULTED', 'ABANDONED']);

// matchUpId -> last submitted outcome signature; skips duplicate submits of an
// unchanged outcome while still re-submitting a corrected (re-scored) result.
const submittedOutcomes = new Map<string, string>();

function isFinal(data: any): boolean {
  return !!data?.winningSide || (typeof data?.matchUpStatus === 'string' && FINAL_STATUSES.has(data.matchUpStatus));
}

function outcomeSignature(data: any): string {
  return `${data?.matchUpStatus ?? ''}|${data?.winningSide ?? ''}|${JSON.stringify(data?.score?.sets ?? [])}`;
}

/** Build the POST /factory/score payload from a locally-stored matchUp, or null
 *  when it is not a submittable tournament match (missing tournamentId/drawId). */
export function buildOutcomeFromStored(data: any): ScoreSubmitParams | null {
  const tournamentId = data?.tournamentId || data?.match?.tournamentId || data?.tournament?.tournamentId;
  const drawId = data?.drawId || data?.match?.drawId;
  const matchUpId = data?.matchUpId || data?.match?.matchUpId;
  if (!tournamentId || !drawId || !matchUpId) return null;
  return {
    tournamentId,
    matchUpId,
    drawId,
    outcome: {
      score: { sets: data?.score?.sets ?? [] },
      winningSide: data?.winningSide,
      matchUpStatus: data?.matchUpStatus || 'COMPLETED',
    },
  };
}

/**
 * Submit the final outcome for `matchUpId` if it is complete, authorized, and
 * tournament-linked. Never throws. Idempotent per unchanged outcome.
 */
export async function submitFinalOutcomeIfReady(matchUpId: string): Promise<SubmitFinalOutcomeResult> {
  const raw = browserStorage.get(matchUpId);
  if (!raw) return { status: 'skipped', reason: 'not-found' };

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 'skipped', reason: 'not-found' };
  }

  if (!isFinal(data)) return { status: 'skipped', reason: 'incomplete' };

  // Build first so a non-tournament local match resolves to `not-tournament`
  // (no login prompt) while a genuine tournament match with no session resolves
  // to `unauthenticated` (worth prompting the scorer to log in).
  const dto = buildOutcomeFromStored(data);
  if (!dto) return { status: 'skipped', reason: 'not-tournament' };

  if (!getLoginState()) return { status: 'skipped', reason: 'unauthenticated' };

  const signature = outcomeSignature(data);
  if (submittedOutcomes.get(matchUpId) === signature) return { status: 'submitted' };

  const result = await submitOfficialScore(dto);
  if (result.success) {
    submittedOutcomes.set(matchUpId, signature);
    console.log('[finalize] official outcome submitted to CFS', { matchUpId });
    return { status: 'submitted' };
  }
  console.warn('[finalize] official outcome submit failed:', result.error);
  return { status: 'error', error: result.error || 'submit failed' };
}

/** Test seam. */
export const __test__ = { reset: () => submittedOutcomes.clear() };
