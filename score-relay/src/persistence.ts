import axios from 'axios';
import type { MatchHistory } from './types.js';

let factoryServerUrl: string | undefined;
let serviceJwt: string | undefined;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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
      await axios.post(`${factoryServerUrl}/factory/score`, payload, { headers });
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
export function buildScorePayload(history: MatchHistory): {
  tournamentId: string;
  matchUpId: string;
  matchUpFormat?: string;
  outcome: { matchUpStatus?: string; winningSide?: number; score?: { sets?: any[] }; matchUpFormat?: string };
} {
  const sets = history.score?.sets;
  const winningSide = history.score?.winningSide;
  const matchUpStatus = winningSide ? 'COMPLETED' : 'IN_PROGRESS';
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
