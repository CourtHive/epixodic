import type { HydratedMatchUp } from '../types';

/**
 * Build the payload that stages a tournament matchUp for scoring.
 *
 * Extracted from `MatchUpList.svelte` so the REFUSAL is testable. There is no Svelte component test
 * layer in this repo (Playwright is the DOM layer), so a decision left inside a component gets no
 * unit coverage — and this decision is the one that keeps fabricated data out of scoring.
 *
 * `matchUpFormat` is never defaulted. It decides how every subsequent score is interpreted, it is
 * determined by the tournamentRecord and delivered by the factory, and there is no correct way to
 * guess it: a match scored against a fabricated best-of-3 is not slightly wrong, it is
 * uninterpretable. A matchUp arriving without one is refused rather than scored on a guess.
 *
 * Defensive in practice — every matchUp on a real production tournament carried a `matchUpFormat`
 * (measured 211/211 across three events). This exists so the guess cannot silently reappear.
 */
export type StageResult = { ok: true; matchData: Record<string, any> } | { ok: false; reason: string };

export function buildMatchData(matchUp: HydratedMatchUp): StageResult {
  if (!matchUp?.matchUpId) return { ok: false, reason: 'missing matchUpId' };
  if (!matchUp.matchUpFormat) return { ok: false, reason: 'missing matchUpFormat' };

  return {
    ok: true,
    matchData: {
      matchUpId: matchUp.matchUpId,
      matchUpFormat: matchUp.matchUpFormat,
      sides: matchUp.sides,
      score: matchUp.score,
      // drawId is required for the authorized CFS final-outcome submit
      // (POST /factory/score); carry it through the local round-trip.
      drawId: matchUp.drawId,
      match: {
        matchUpId: matchUp.matchUpId,
        tournamentId: matchUp.tournamentId,
        drawId: matchUp.drawId,
      },
      tournament: {
        tournamentId: matchUp.tournamentId,
      },
    },
  };
}
