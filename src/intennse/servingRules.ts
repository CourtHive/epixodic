/**
 * INTENNSE serving rules.
 *
 * 1. The team that won the last point always serves next.
 * 2. The serve court side (DEUCE or AD) is determined by the AGGREGATE
 *    score across all bolts: even total = DEUCE, odd total = AD.
 */

import type { Side } from './pointRules';

export type ServeSide = 'DEUCE' | 'AD';

export interface ServingState {
  /** Which team (0 or 1) is serving */
  server: Side;
  /** Which court side the serve is from */
  serveSide: ServeSide;
}

/**
 * Determine who serves next after a point.
 *
 * In INTENNSE, the team that won the point always serves next.
 * For a fault (no point awarded), the server switches to the opponent.
 *
 * @param pointWinner - The side that won the point (null for fault)
 * @param currentServer - The current server before this point
 */
export function getNextServer(pointWinner: Side | null, currentServer: Side): Side {
  if (pointWinner === null) {
    // Fault: serve passes to opponent
    return (1 - currentServer) as Side;
  }
  // Winner of the point serves next
  return pointWinner;
}

/**
 * Determine the serve court side from the aggregate score.
 *
 * Even aggregate total = DEUCE, odd = AD.
 *
 * @param aggregateScore - Total points for each side across all bolts
 */
export function getServeSide(aggregateScore: { side1: number; side2: number }): ServeSide {
  const total = aggregateScore.side1 + aggregateScore.side2;
  return total % 2 === 0 ? 'DEUCE' : 'AD';
}

/**
 * Compute the full serving state after a point.
 */
export function getServingState(
  pointWinner: Side | null,
  currentServer: Side,
  aggregateScore: { side1: number; side2: number },
): ServingState {
  return {
    server: getNextServer(pointWinner, currentServer),
    serveSide: getServeSide(aggregateScore),
  };
}

/**
 * Within-side server rotation for doubles.
 *
 * In standard tennis doubles partners alternate as servers across their
 * side's service "tours". INTENNSE has no traditional games — a serve tour
 * is simply a run of consecutive points on which the same side serves.
 * Each new tour the alternate partner serves.
 *
 * Rule: when the serving side LOSES a point (the receiver wins), flip the
 * losing side's serverIndex so the next time they regain the serve their
 * partner is up. The receiving side's index is unchanged — they'll keep
 * serving with whichever player was already cued up for their next tour.
 *
 * Faults are not point outcomes and never rotate.
 *
 * Pure function — no side effects, easy to test.
 */
export function updateSideServerIndices(args: {
  pointWinner: Side | null;
  previousServer: Side;
  side1ServerIndex: 0 | 1;
  side2ServerIndex: 0 | 1;
}): { side1ServerIndex: 0 | 1; side2ServerIndex: 0 | 1 } {
  const { pointWinner, previousServer, side1ServerIndex, side2ServerIndex } = args;
  if (pointWinner === null) return { side1ServerIndex, side2ServerIndex };
  // No rotation if the serving side held serve
  if (pointWinner === previousServer) return { side1ServerIndex, side2ServerIndex };
  // Serving side lost: flip THEIR index for the next tour
  if (previousServer === 0) {
    return { side1ServerIndex: (1 - side1ServerIndex) as 0 | 1, side2ServerIndex };
  }
  return { side1ServerIndex, side2ServerIndex: (1 - side2ServerIndex) as 0 | 1 };
}
