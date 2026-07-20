/**
 * crowdScorerIdentity — resolve the HiveID scorer identity handed off when
 * epixodic is launched from courthive-public's "Score this match" flow
 * (crowd-scoring Phase D, epixodic slice).
 *
 * The launcher appends a scorer token to the epixodic hash route
 * (`#/match/<id>/scoring?scorerToken=<jwt>`). Reading it here lets epixodic
 * submit crowd scores to the relay's `/crowd` namespace as that person —
 * identical to scoring inline on courthive-public — so a nominated scorer's
 * epixodic scores flow through TMX's `classifyScorer` → one-click Accept.
 *
 * The token in the URL is a short-lived, scope-narrowed `aud: 'score'` token
 * minted by CFS `POST /auth/scorer-token` (personId + email_verified are the
 * caller's own session claims). It grants nothing against CFS and is accepted
 * only by the relay `/crowd` namespace — NOT the full HiveID session JWT, which
 * would leak a whole-session credential into history/logs. The wire shape here
 * is unchanged: any JWT carrying personId + email_verified decodes the same way.
 */

import { jwtDecode } from 'jwt-decode';

const SCORER_TOKEN_PARAM = 'scorerToken';

/** Read the scorer token from a launch URL hash query, e.g.
 *  `#/match/<id>/scoring?scorerToken=<jwt>`. Returns null when absent. */
export function readScorerTokenFromHash(hash: string): string | null {
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return null;
  return new URLSearchParams(hash.slice(qIndex + 1)).get(SCORER_TOKEN_PARAM);
}

export interface CrowdScorerIdentity {
  token: string;
  personId: string | null;
  displayName: string;
  verified: boolean;
}

/** Decode a HiveID / scoring JWT into the crowd scorer identity. Returns null
 *  for an absent or undecodable token. */
export function decodeScorerIdentity(token: string | null): CrowdScorerIdentity | null {
  if (!token) return null;
  try {
    const claims: any = jwtDecode(token);
    return {
      token,
      personId: claims?.personId ?? claims?.sub ?? null,
      displayName: claims?.name ?? claims?.displayName ?? claims?.email ?? 'HiveID scorer',
      verified: claims?.email_verified === true || claims?.verified === true,
    };
  } catch {
    return null;
  }
}

let cached: CrowdScorerIdentity | null | undefined;

/** Resolve (once) the launched-with scorer identity from the current URL. */
export function getCrowdScorerIdentity(): CrowdScorerIdentity | null {
  if (cached !== undefined) return cached;
  const hash = typeof globalThis !== 'undefined' ? (globalThis.location?.hash ?? '') : '';
  cached = decodeScorerIdentity(readScorerTokenFromHash(hash));
  return cached;
}

/** Test seam. */
export const __test__ = { reset: () => (cached = undefined) };
