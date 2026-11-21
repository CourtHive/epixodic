import type { ScoreSubmitParams } from '../services/messaging/scoreSubmitApi';
import type { HydratedMatchUp } from '../svelte/types';

/**
 * The Arc's deciding point (INTENNSE rules § 1.3).
 *
 * The Arc is won on the team total across its tieMatchUps. When that total is level after the final bolt, one deciding
 * point is played. It belongs to the TEAM matchUp, not to the last tieMatchUp: that tieMatchUp is already complete (a
 * level or uneven bolt alike), so its engine refuses another point, and writing the point into it would fabricate an
 * individual result (PORTFOLIO-016, 2026-11-13 ecosystem review).
 *
 * So the point is played outside the tieMatchUp engine and recorded on the TEAM dual as a decision outside its score:
 * the dual keeps its level aggregate, and `score.overtime` says how it was decided (factory #6288 keeps the aggregate
 * when a dual's decision is recorded this way).
 */

export type ArcTotal = { side1: number; side2: number };

export const ARC_DECIDING_POINT_RULE = 'INTENNSE deciding point';

/** True when the Arc's team total is level: the deciding point must be played. */
export function arcIsLevel(total: ArcTotal): boolean {
  return total.side1 === total.side2;
}

/** The Arc's winning side: the team total's leader, else the deciding point's winner, else none. */
export function arcWinningSide(total: ArcTotal, decidingPointSide?: 1 | 2): 1 | 2 | undefined {
  if (total.side1 > total.side2) return 1;
  if (total.side2 > total.side1) return 2;
  return decidingPointSide;
}

/**
 * The TEAM dual's outcome for a level Arc settled by the deciding point, for POST /factory/score. Null without a
 * backing tournament (demo mode).
 */
export function buildArcDecisionOutcome(options: {
  teamMatchUp: HydratedMatchUp | null;
  decidingPointSide: 1 | 2;
}): ScoreSubmitParams | null {
  const { teamMatchUp, decidingPointSide } = options;
  const tournamentId = teamMatchUp?.tournamentId;
  const drawId = teamMatchUp?.drawId;
  const matchUpId = teamMatchUp?.matchUpId;
  if (!tournamentId || !drawId || !matchUpId) return null;

  return {
    tournamentId,
    matchUpId,
    drawId,
    outcome: {
      matchUpStatus: 'COMPLETED',
      winningSide: decidingPointSide,
      score: {
        overtime: {
          decidedIn: 'EXTERNAL',
          decidedBy: {
            method: 'COMPETITION_RULE',
            rule: ARC_DECIDING_POINT_RULE,
            tally: decidingPointSide === 1 ? [1, 0] : [0, 1],
          },
        },
      },
    },
  };
}
