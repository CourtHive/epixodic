import type { HydratedMatchUp } from '../svelte/types';
import type { ScoreSubmitParams } from '../services/messaging/scoreSubmitApi';

/**
 * Construct the SetMatchUpStatusDto payload for POST /factory/score
 * from a tieMatchUp's engine state and its parent team matchUp context.
 *
 * Returns null if required fields (tournamentId, drawId) are missing,
 * e.g. in demo mode where there's no backing tournament.
 */
export function buildScoreOutcome(options: {
  matchUpId: string;
  engineState: any;
  teamMatchUp: HydratedMatchUp | null;
}): ScoreSubmitParams | null {
  const { matchUpId, engineState, teamMatchUp } = options;
  if (!teamMatchUp || !engineState) return null;

  const tournamentId = teamMatchUp.tournamentId;
  if (!tournamentId) return null;

  // drawId may be on the tieMatchUp itself or the parent team matchUp
  const tieMatchUp = teamMatchUp.tieMatchUps?.find((m) => m.matchUpId === matchUpId);
  const drawId = tieMatchUp?.drawId || teamMatchUp.drawId;
  if (!drawId) return null;

  const sets = engineState?.score?.sets ?? [];
  const isComplete = engineState?.matchUpStatus === 'COMPLETED';
  const matchUpStatus = isComplete ? 'COMPLETED' : 'IN_PROGRESS';

  // Determine winningSide from the engine state if the match is complete
  let winningSide: number | undefined;
  if (isComplete && sets.length > 0) {
    let side1Total = 0;
    let side2Total = 0;
    for (const set of sets) {
      side1Total += set.side1Score ?? 0;
      side2Total += set.side2Score ?? 0;
    }
    if (side1Total !== side2Total) {
      winningSide = side1Total > side2Total ? 1 : 2;
    }
  }

  return {
    tournamentId,
    matchUpId,
    drawId,
    outcome: {
      score: { sets },
      winningSide,
      matchUpStatus,
    },
  };
}
