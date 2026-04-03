/**
 * INTENNSE point attribution rules.
 *
 * Given a result type and the side whose button was pressed,
 * returns the winner (side that receives the point) and the result string
 * to pass to the ScoringEngine.
 *
 * In INTENNSE:
 * - Winner/Ace: pressing side wins, 2 points
 * - Touch: pressing side lost the rally but touched the ball — opponent gets 1 point
 * - Forced/Unforced Error: pressing side committed the error — opponent gets the point
 * - Fault: loss of serve, no point awarded (returns null winner)
 */

export type Side = 0 | 1;

export interface PointAttribution {
  /** Side that receives the point (null for fault — no point awarded) */
  winner: Side | null;
  /** Result string for the ScoringEngine */
  result: string;
}

const opponent = (side: Side): Side => (1 - side) as Side;

/**
 * Resolve who gets the point for a given action.
 *
 * @param action - The button pressed (e.g. 'winner', 'touch', 'ace')
 * @param side - The side (0 or 1) whose button was pressed
 */
export function resolvePointAttribution(action: string, side: Side): PointAttribution {
  switch (action) {
    case 'winner':
      return { winner: side, result: 'Winner' };
    case 'ace':
      return { winner: side, result: 'Ace' };
    case 'touch':
      // Pressing side touched the ball — limits opponent to 1 point instead of 2
      return { winner: opponent(side), result: 'Touch' };
    case 'forcedError':
      return { winner: opponent(side), result: 'Forced Error' };
    case 'unforcedError':
      return { winner: opponent(side), result: 'Unforced Error' };
    case 'fault':
      // Loss of serve only — no point awarded
      return { winner: null, result: 'Fault' };
    default:
      return { winner: side, result: action };
  }
}
