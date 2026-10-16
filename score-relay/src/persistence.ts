import { governors, matchUpFormatCode } from 'tods-competition-factory';
import axios from 'axios';

// constants and types
import type { MatchHistory } from './types.js';

let factoryServerUrl: string | undefined;
let serviceJwt: string | undefined;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
/** Per request; without it the retry count bounds nothing when a connection hangs. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Configure the canonical persistence target.
 *
 * @param url        CFS base URL, e.g. https://courthive.net
 * @param jwt        Optional service JWT with the SCORE role audience.
 *                   When present the relay attaches Authorization: Bearer
 *                   on every persistence call. Without it the call goes
 *                   anonymous and CFS's RolesGuard rejects it — fine for
 *                   environments where canonical persistence is disabled.
 */
export function configurePersistence(url?: string, jwt?: string): void {
  factoryServerUrl = url;
  serviceJwt = jwt;
}

/**
 * Forward a tracker's final match history to CFS for canonical
 * persistence. Posts to `POST /factory/score` — the SCORE-role
 * endpoint that drives `factoryService.score()` through the
 * executionQueue.
 *
 * The payload matches CFS's `SetMatchUpStatusDto` flat shape with an
 * `outcome` block carrying score + winningSide + matchUpFormat. The
 * relay does not know the matchUp's drawId; CFS resolves it server-
 * side via `findMatchUp(tournamentRecord, matchUpId)`.
 *
 * Retries 3× with exponential backoff. Failures log a warning and
 * never block the broadcast path.
 */
export async function persistMatchHistory(history: MatchHistory): Promise<void> {
  if (!factoryServerUrl) return;
  if (!history.tournamentId) {
    console.warn(`[persist] skipping ${history.matchUpId}: no tournamentId on history`);
    return;
  }

  const payload = buildScorePayload(history);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceJwt) headers.Authorization = `Bearer ${serviceJwt}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(`${factoryServerUrl}/factory/score`, payload, { headers, timeout: REQUEST_TIMEOUT_MS });
      return;
    } catch (err: any) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const status = err?.response?.status;
      if (isLastAttempt) {
        console.error(
          `[persist] Failed to persist match ${history.matchUpId} after ${MAX_RETRIES} attempts ` +
            `(status=${status ?? 'n/a'}): ${err.message}`,
        );
      } else {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[persist] Attempt ${attempt} failed for ${history.matchUpId} (status=${status ?? 'n/a'}), retrying in ${delay}ms…`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Map relay-side `MatchHistory` → CFS `SetMatchUpStatusDto`. The
 * `drawId` field is intentionally absent — CFS's setMatchUpStatus
 * wrapper resolves it from `tournamentId + matchUpId` via the factory
 * `findMatchUp` brute-force lookup.
 */
/**
 * A level combined-point total whose format lets the tie stand, and that the factory says is over
 * (`checkSetIsComplete` hands a combined-point set to its own `analyzeCombinedPointSet`). A deciding-point or
 * win-by format (P32DP, P32WB2) never ends level, so it is never a completed tie.
 */
function isCompletedCombinedPointTie(sets: any[] | undefined, matchUpFormat?: string): boolean {
  const setFormat = matchUpFormatCode.parse(matchUpFormat ?? '')?.setFormat;
  if (!setFormat?.combinedPointTotal || setFormat.tieResolution !== 'ALLOW') return false;
  if (sets?.length !== 1) return false;
  const [set] = sets;
  if (set.side1Score === undefined || set.side1Score !== set.side2Score) return false;
  return governors.scoreGovernor.checkSetIsComplete({ set, matchUpFormat, isDecidingSet: true }) === true;
}

export function buildScorePayload(history: MatchHistory): {
  tournamentId: string;
  matchUpId: string;
  matchUpFormat?: string;
  outcome: { matchUpStatus?: string; winningSide?: number; score?: { sets?: any[] }; matchUpFormat?: string };
} {
  const sets = history.score?.sets;
  const winningSide = history.score?.winningSide;
  // A combined-point total that allows a tie (SET1-S:P32) ends 16-16 with no winner: finished all the same.
  const finished = !!winningSide || isCompletedCombinedPointTie(sets, history.matchUpFormat);
  const matchUpStatus = finished ? 'COMPLETED' : 'IN_PROGRESS';
  return {
    tournamentId: history.tournamentId!,
    matchUpId: history.matchUpId,
    matchUpFormat: history.matchUpFormat,
    outcome: {
      matchUpStatus,
      winningSide,
      matchUpFormat: history.matchUpFormat,
      score: sets ? { sets } : undefined,
    },
  };
}
