/**
 * INTENNSE score computation — pure functions for deriving bolt and
 * aggregate scores from ScoringEngine state.
 */

export interface BoltScore {
  side1: number;
  side2: number;
}

/**
 * Extract the current bolt score from engine state.
 * The current bolt is the last set in the score.
 */
export function getCurrentBoltScore(engineState: any): BoltScore {
  const sets = engineState?.score?.sets;
  if (!sets?.length) return { side1: 0, side2: 0 };
  const current = sets[sets.length - 1];
  return { side1: current.side1Score ?? 0, side2: current.side2Score ?? 0 };
}

/**
 * Compute the aggregate (Arc) score across all bolts.
 */
export function getAggregateScore(engineState: any): BoltScore {
  const sets = engineState?.score?.sets ?? [];
  return sets.reduce(
    (acc: BoltScore, s: any) => ({
      side1: acc.side1 + (s.side1Score ?? 0),
      side2: acc.side2 + (s.side2Score ?? 0),
    }),
    { side1: 0, side2: 0 },
  );
}
