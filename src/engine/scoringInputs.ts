/**
 * What the classic scorer's game, set and server controls send to the factory ScoringEngine.
 *
 * Since tods-competition-factory 7.16.0 the engine judges every input by the rule of the segment it
 * lands in (scoring spec § 2, CA 2026-10-18):
 * - a game in a tiebreak-only segment wins that segment 1-0;
 * - a set total is judged by its segment's rule, and a total entered while a set is in play closes
 *   that set with the posted total, replacing the games played in it;
 * - refused input throws, and input after the match is complete is ignored (`{ recorded: false }`);
 * - tiebreak-only formats (`S:TB{n}`, pickleball, squash, table tennis) and combined totals (`P{n}`)
 *   derive no server, so `getNextServer()` is only a placeholder there and `isServerDerived()` says
 *   so. Under `@RALLY` the rally winner serves, which is a derivation. A tennis match tiebreak keeps
 *   Rule 5(b).
 */

type Side = 0 | 1;

type SetTotal = { side1Score: number; side2Score: number; winningSide: 1 | 2 };

export type ScoringActionResult = { recorded: boolean; ignored?: string; refusal?: string };

/** The set a live input lands in: the last set while it is open, otherwise the next one. */
function openSetNumber(sets: any[]): number {
  const last = sets[sets.length - 1];
  const open = last && last.winningSide === undefined && !last.segmentComplete;
  return sets.length + (open ? 0 : 1);
}

function openSet(sets: any[]): any {
  return openSetNumber(sets) === sets.length ? sets[sets.length - 1] : undefined;
}

/**
 * The format governing the set in play: the final-set format in the deciding set, the ordinary one
 * otherwise. Mirrors the factory's rule for best-of and exactly formats (spec § 3.2); the classic
 * scorer runs no aggregate format with a declared decider, so that case is not read here.
 */
export function setInPlayFormat(engine: any): any {
  const structure = engine?.getFormatStructure?.();
  if (!structure) return undefined;
  const sets: any[] = engine.getState()?.score?.sets ?? [];
  const setNumber = openSetNumber(sets);
  const setsWon = [0, 0];
  sets.forEach((set) => {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  });
  const bestOf = structure.bestOf || structure.exactly || 3;
  const setsToWin = Math.ceil(bestOf / 2);
  const bothOneFromWinning = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;
  const deciding = structure.exactly ? setNumber === structure.exactly : bothOneFromWinning || setNumber === bestOf;
  return deciding && structure.finalSetFormat ? structure.finalSetFormat : structure.setFormat;
}

/** A tiebreak-only segment is in play (a match tiebreak included): a game there wins the set 1-0. */
export function isTiebreakOnlySetInPlay(engine: any): boolean {
  return !!setInPlayFormat(engine)?.tiebreakSet;
}

/** The fewest games that win a standard set for a side whose opponent has `opponent` games. */
function standardWinningGames(setFormat: any, own: number, opponent: number): number {
  const setTo = setFormat.setTo || 6;
  const tiebreakAt = typeof setFormat.tiebreakAt === 'number' ? setFormat.tiebreakAt : setTo;
  // the factory's setHasTiebreak
  const hasTiebreak = !setFormat.noTiebreak && (!!setFormat.tiebreakFormat || typeof setFormat.tiebreakAt === 'number');
  if (hasTiebreak && opponent >= tiebreakAt) return tiebreakAt + 1;
  return Math.max(own, setTo, opponent + (setFormat.winBy || 2));
}

/**
 * The total the set control posts for `side`: the set in play won by that side. The opponent keeps the
 * games it has played; the side's games are raised to the fewest that win the set by its rule (6-3 from
 * 2-3 in a set to six, 7-5 from 5-5, 7-6 from 6-6, 4-0 in a short set, 8-0 in a pro set). A tiebreak-only
 * segment is posted as the set won 1-0, a timed one as the side one unit ahead.
 */
export function setTotalFor(engine: any, side: Side): SetTotal {
  const sets: any[] = engine.getState()?.score?.sets ?? [];
  const inPlay = openSet(sets);
  const own = (side === 0 ? inPlay?.side1Score : inPlay?.side2Score) ?? 0;
  const opponent = (side === 0 ? inPlay?.side2Score : inPlay?.side1Score) ?? 0;
  const setFormat = setInPlayFormat(engine);

  let won: number;
  let lost = opponent;
  if (setFormat?.tiebreakSet) {
    won = 1;
    lost = 0;
  } else if (setFormat && !setFormat.timed && !setFormat.outs && !setFormat.combinedPointTotal) {
    won = standardWinningGames(setFormat, own, opponent);
  } else {
    won = Math.max(own, opponent + 1);
  }

  return {
    side1Score: side === 0 ? won : lost,
    side2Score: side === 0 ? lost : won,
    winningSide: (side + 1) as 1 | 2,
  };
}

/**
 * Run a scoring action, reading its result: `{ recorded: true }`, an ignored input (the match is
 * complete), or a refusal the engine threw. A refusal recorded nothing, so the caller records nothing.
 */
export function runScoringAction(action: () => any): ScoringActionResult {
  try {
    // a factory before the result contract returned nothing and recorded unconditionally
    return action() ?? { recorded: true };
  } catch (error: any) {
    return { recorded: false, refusal: error?.message ?? String(error) };
  }
}

/** The index of the set the last recorded game or set landed in, read after the call. */
export function lastSetIndex(engine: any): number {
  return (engine.getState()?.score?.sets?.length ?? 1) - 1;
}

/** Whether the engine derives the server: false for `S:TB{n}` (without `@RALLY`) and `P{n}` formats. */
export function isServerDerived(engine: any): boolean {
  return engine?.isServerDerived ? !!engine.isServerDerived() : true;
}

/**
 * Who serves next. Before the first point, and wherever the engine derives no server, it is the side the
 * scorer chose (`clientServing`): there `getNextServer()` is only a placeholder.
 */
export function nextServer(engine: any, clientServing: number): number {
  const points = engine.getState()?.history?.points || [];
  if (points.length === 0 || !isServerDerived(engine)) return clientServing;
  return engine.getNextServer();
}

/** The scorer may name the server before the first point, and at any time where none is derived. */
export function canChangeServer(engine: any): boolean {
  const points = engine.getState()?.history?.points || [];
  return points.length === 0 || !isServerDerived(engine);
}
