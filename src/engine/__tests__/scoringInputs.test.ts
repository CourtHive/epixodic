/**
 * The classic scorer's game, set and server controls against the real factory ScoringEngine (7.16.0),
 * which judges every input by its segment's rule (scoring spec § 2, CA 2026-10-18).
 */
import { scoreGovernor } from 'tods-competition-factory';
import { describe, it, expect } from 'vitest';
import {
  canChangeServer,
  isServerDerived,
  isTiebreakOnlySetInPlay,
  lastSetIndex,
  nextServer,
  runScoringAction,
  setTotalFor,
} from '../scoringInputs';

const { ScoringEngine } = scoreGovernor;

const engineFor = (matchUpFormat: string): any => new ScoringEngine({ matchUpFormat });

/** Score games in the set in play by points, so they are games played and not a posted total. */
function playGames(engine: any, side1: number, side2: number) {
  const order: (0 | 1)[] = [];
  for (let i = 0; i < Math.max(side1, side2); i++) {
    if (i < side1) order.push(0);
    if (i < side2) order.push(1);
  }
  for (const winner of order) for (let p = 0; p < 4; p++) engine.addPoint({ winner });
}

/** What classAction.set() does: post the total for `side`, then read the set index after the call. */
function postSet(engine: any, side: 0 | 1) {
  const total = setTotalFor(engine, side);
  const result = runScoringAction(() => engine.addSet(total));
  return { total, result, setIndex: lastSetIndex(engine) };
}

const lastSet = (engine: any) => engine.getState().score.sets.slice(-1)[0];

describe('a game in a tiebreak-only segment', () => {
  it('is the set won 1-0, so the game control is hidden there', () => {
    const engine = engineFor('SET1-S:TB10');
    expect(isTiebreakOnlySetInPlay(engine)).toBe(true);
    // the factory's meaning, which the hidden control would otherwise trigger per tap
    engine.addGame({ winner: 0 });
    expect(engine.isComplete()).toBe(true);
    expect(lastSet(engine)).toMatchObject({ side1Score: 1, side2Score: 0, winningSide: 1 });
  });

  it('the match tiebreak of a best of three is tiebreak-only; the sets before it are not', () => {
    const engine = engineFor('SET3-S:6NOAD/TB7-F:TB10');
    expect(isTiebreakOnlySetInPlay(engine)).toBe(false);
    engine.addSet({ side1Score: 6, side2Score: 3 });
    expect(isTiebreakOnlySetInPlay(engine)).toBe(false);
    engine.addSet({ side1Score: 2, side2Score: 6 });
    expect(isTiebreakOnlySetInPlay(engine)).toBe(true);
  });

  it("an aggregate format's decider is tiebreak-only in set N + 1 only, as the engine rules", () => {
    // Two timed sets, then a match tiebreak if the aggregate is level. The scorer's own copy of the
    // deciding-set rule read set 2 (= `exactly`) as the decider, hiding the game control mid-timed set.
    const engine = engineFor('SET2XA-S:T10-F:TB10');
    engine.addSet({ side1Score: 3, side2Score: 5 });
    expect(isTiebreakOnlySetInPlay(engine)).toBe(false);
    engine.addSet({ side1Score: 5, side2Score: 3 });
    expect(engine.isComplete()).toBe(false);
    expect(isTiebreakOnlySetInPlay(engine)).toBe(true);
    expect(setTotalFor(engine, 1)).toEqual({ side1Score: 0, side2Score: 1, winningSide: 2 });
  });

  it('a standard set is not tiebreak-only, even at six all', () => {
    const engine = engineFor('SET3-S:6/TB7');
    playGames(engine, 6, 6);
    expect(isTiebreakOnlySetInPlay(engine)).toBe(false);
  });
});

describe('the set control posts the real total', () => {
  it.each([
    ['SET3-S:6/TB7', 6],
    ['SET1-S:4NOAD/TB7@3', 4],
    ['SET1-S:8/TB7', 8],
    ['SET3-S:6/TB7-F:6', 6],
  ])('%s: a set not yet started is won %i-0', (format, games) => {
    const engine = engineFor(format);
    const { total, result } = postSet(engine, 0);
    expect(total).toEqual({ side1Score: games, side2Score: 0, winningSide: 1 });
    expect(result).toEqual({ recorded: true });
    expect(lastSet(engine)).toMatchObject({ side1Score: games, side2Score: 0, winningSide: 1 });
  });

  it.each([
    // [format, side1 games played, side2 games played, side tapping, expected total]
    ['SET3-S:6/TB7', 2, 3, 0, [6, 3]],
    ['SET3-S:6/TB7', 2, 3, 1, [2, 6]],
    ['SET3-S:6/TB7', 5, 5, 1, [5, 7]],
    ['SET3-S:6/TB7', 4, 5, 0, [7, 5]],
    ['SET3-S:6/TB7', 6, 6, 0, [7, 6]],
    ['SET1-S:4NOAD/TB7@3', 2, 1, 1, [2, 4]],
    ['SET1-S:4NOAD/TB7@3', 3, 3, 0, [4, 3]],
    ['SET1-S:8/TB7', 7, 7, 1, [7, 9]],
  ])(
    '%s at %i-%i in play, side %i: the set closes as %j, keeping the games played',
    (format, g1, g2, side, expected) => {
      const engine = engineFor(format as string);
      playGames(engine, g1 as number, g2 as number);
      expect(engine.getState().score.sets).toHaveLength(1);
      const { result, setIndex } = postSet(engine, side as 0 | 1);
      expect(result).toEqual({ recorded: true });
      // the set in play closed: no set beside it, and the index read after the call is that set's
      const sets = engine.getState().score.sets;
      expect(sets).toHaveLength(1);
      expect(setIndex).toBe(0);
      expect(sets[0]).toMatchObject({
        side1Score: (expected as number[])[0],
        side2Score: (expected as number[])[1],
        winningSide: (side as number) + 1,
      });
    },
  );

  it('the long final set is played to two clear games', () => {
    const engine = engineFor('SET3-S:6/TB7-F:6');
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    playGames(engine, 6, 6);
    const { total, result, setIndex } = postSet(engine, 0);
    expect(total).toMatchObject({ side1Score: 8, side2Score: 6 });
    expect(result).toEqual({ recorded: true });
    expect(setIndex).toBe(2);
    expect(engine.getWinner()).toBe(1);
  });

  it('the match tiebreak is posted as the set won 1-0, and decides the match', () => {
    const engine = engineFor('SET3-S:6NOAD/TB7-F:TB10');
    postSet(engine, 0);
    postSet(engine, 1);
    const { total, result, setIndex } = postSet(engine, 1);
    expect(total).toEqual({ side1Score: 0, side2Score: 1, winningSide: 2 });
    expect(result).toEqual({ recorded: true });
    expect(setIndex).toBe(2);
    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(2);
  });

  it('a set after the match is complete is ignored, and nothing is recorded for it', () => {
    const engine = engineFor('SET1-S:6/TB7');
    postSet(engine, 0);
    const { result } = postSet(engine, 1);
    expect(result).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.getState().score.sets).toHaveLength(1);
  });

  it('a refused total is returned as a refusal instead of throwing', () => {
    const engine = engineFor('SET3-S:6/TB7');
    const result = runScoringAction(() => engine.addSet({ side1Score: 6, side2Score: 2, winningSide: 2 }));
    expect(result.recorded).toBe(false);
    expect(result.refusal).toMatch(/contradicts/);
    expect(engine.getState().score.sets).toHaveLength(0);
  });
});

describe('the server where the engine derives none', () => {
  it.each(['SET1-S:TB10', 'SET3-S:TB11', 'SET5-S:TB11', 'SET1-S:P32'])(
    '%s: the scorer keeps naming the server',
    (format) => {
      const engine = engineFor(format);
      expect(isServerDerived(engine)).toBe(false);
      engine.addPoint({ winner: 0, server: 1 });
      engine.addPoint({ winner: 0, server: 1 });
      // getNextServer() is only a placeholder here; the scorer's choice stands, and may be changed
      expect(nextServer(engine, 1)).toBe(1);
      expect(nextServer(engine, 0)).toBe(0);
      expect(canChangeServer(engine)).toBe(true);
    },
  );

  it.each(['SET3-S:6/TB7', 'SET3-S:6NOAD/TB7-F:TB10', 'SET3-S:TB11@RALLY', 'SET2XA-S:T10', 'SET7XA-S:T10P'])(
    '%s: the engine derives the server once play starts',
    (format) => {
      const engine = engineFor(format);
      expect(isServerDerived(engine)).toBe(true);
      expect(nextServer(engine, 1)).toBe(1); // before the first point, the scorer's choice
      expect(canChangeServer(engine)).toBe(true);
      engine.addPoint({ winner: 0, server: 0 });
      expect(nextServer(engine, 1)).toBe(engine.getNextServer());
      expect(canChangeServer(engine)).toBe(false);
    },
  );

  it('the match tiebreak of a tennis match keeps its derived server (Rule 5(b))', () => {
    const engine = engineFor('SET3-S:6NOAD/TB7-F:TB10');
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 2, side2Score: 6 });
    expect(isServerDerived(engine)).toBe(true);
  });
});
