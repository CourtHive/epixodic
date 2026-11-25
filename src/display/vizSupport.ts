import { tools } from 'tods-competition-factory';

/**
 * Stub for the game-visualization support check removed from @courthive/scoring-visualizations.
 * Defaults to true until the upstream package re-exports or replaces it.
 */
export const supportsGameVisualizations = (_format: any): boolean => true;

/**
 * Whether a set played to this set format carries points-to-set tuples. The factory's scoring kernel
 * omits `needed` for a timed set (no point endpoint) and for a set that takes no point input (outs, a
 * shootout), so the points-to chart has nothing to draw for it.
 */
function setHasPointsTo(setFormat: any): boolean {
  return !!setFormat && !setFormat.timed && !setFormat.outs && !setFormat.shootout;
}

/**
 * Whether the points-to-set chart can draw anything for this matchUpFormat: true when at least one set
 * the format can play carries points-to tuples. The chart hides a set without tuples, so a mixed format
 * (`SET3-S:TB7-F:T10`) is supported and an all-timed one (`SET1-S:T10`) is not.
 *
 * Reads the parsed set formats rather than the code string. The upstream gate's `/-S:T\d/` never looks
 * at the final set (`-F:T10`), so it answers for the final set only by accident of the other sets, and
 * it rejects `SET3-S:T10-F:TB10`, whose tiebreak final set does carry tuples.
 */
export function supportsPointsToVisualization(format: any): boolean {
  if (!format || typeof format !== 'string') return false;
  const parsed: any = tools.formats.parse(format);
  if (!parsed?.setFormat) return false;

  const setCount = parsed.exactly || parsed.bestOf || 1;
  // sets 1..N-1 play setFormat; set N plays the final-set format when one is declared
  const finalSet = parsed.finalSetFormat ?? parsed.setFormat;
  return setHasPointsTo(finalSet) || (setCount > 1 && setHasPointsTo(parsed.setFormat));
}
