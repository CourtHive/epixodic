/**
 * The INTENNSE bolt flow against the real factory ScoringEngine (7.16.0): what BoltScoringPage does on a
 * bolt's expiry, at a level tieMatchUp, after an undo, and with the engine's per-point `serveSide`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fixtures } from 'tods-competition-factory';
import { getAggregateScore } from '../../../intennse/scoreComputation';
import { buildScoreOutcome } from '../../../intennse/buildScoreOutcome';
import { getServingState } from '../../../intennse/servingRules';
import {
  initScoringEngine,
  destroyScoringEngine,
  addPoint,
  endSegment,
  setServer,
  undo,
  getEngine,
  getEngineState,
} from '../scoringEngine.svelte';

const INTENNSE_STANDARD = (fixtures as any).competitionFormats.INTENNSE_STANDARD;

/** What BoltScoringPage's point handler does: add the point, then name the next server from the rules. */
function scorePoint(winner: 0 | 1) {
  const previousServer = getEngine().getNextServer() as 0 | 1;
  addPoint(winner);
  const serving = getServingState(winner, previousServer, getAggregateScore(getEngineState()));
  setServer(serving.server, { recordEntry: false });
  return serving;
}

const teamMatchUp: any = {
  tournamentId: 't-1',
  drawId: 'd-1',
  tieMatchUps: [{ matchUpId: 'tie-1', drawId: 'd-1' }],
};

describe('ending a bolt', () => {
  beforeEach(() => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET2XA-S:T10', competitionFormat: INTENNSE_STANDARD });
  });

  it('a second end of a bolt already closed is refused and returned, not thrown', () => {
    scorePoint(0);
    expect(endSegment({ reason: 'bolt_expired' })).toEqual({ recorded: true });
    const entries = getEngineState().history.entries.length;

    let second: any;
    expect(() => (second = endSegment({ reason: 'bolt_expired' }))).not.toThrow();
    expect(second.recorded).toBe(false);
    expect(second.refusal).toMatch(/closed/);
    expect(getEngineState().history.entries).toHaveLength(entries);
  });

  it('an end with no bolt in play is refused and returned, not thrown', () => {
    const result = endSegment({ reason: 'bolt_expired' });
    expect(result.recorded).toBe(false);
    expect(result.refusal).toBeDefined();
  });

  it('an end after the tieMatchUp is complete is ignored', () => {
    scorePoint(0);
    endSegment({ reason: 'bolt_expired' });
    scorePoint(0);
    endSegment({ reason: 'bolt_expired' });
    expect(getEngine().isComplete()).toBe(true);
    expect(endSegment({ reason: 'bolt_expired' })).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
  });
});

describe('a level tieMatchUp', () => {
  it.each(['SET2XA-S:T10', 'SET1A-S:T10'])('%s is COMPLETED with no winner, and the outcome carries none', (format) => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: format, competitionFormat: INTENNSE_STANDARD });
    const bolts = format.startsWith('SET2') ? 2 : 1;
    for (let bolt = 0; bolt < bolts; bolt++) {
      scorePoint(0);
      scorePoint(1);
      endSegment({ reason: 'bolt_expired' });
    }

    const engine = getEngine();
    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBeUndefined();
    expect(engine.getScore().decisionRequired).toBe(true);

    const outcome = buildScoreOutcome({ matchUpId: 'tie-1', engineState: getEngineState(), teamMatchUp });
    expect(outcome!.outcome.matchUpStatus).toBe('COMPLETED');
    expect(outcome!.outcome.winningSide).toBeUndefined();
  });
});

describe('the server after an undo', () => {
  beforeEach(() => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET2XA-S:T10', competitionFormat: INTENNSE_STANDARD });
  });

  // Both sequences gave the wrong server after the undo on factory 7.15.0 (side 1 and side 2 respectively).
  it.each([
    [[1, 1, 0], 1],
    [[0, 0, 0, 1], 0],
  ])('after %j and an undo, the winner of the last remaining point serves (factory #5614)', (winners, server) => {
    setServer(0);
    (winners as (0 | 1)[]).forEach((winner) => scorePoint(winner));
    expect(getEngine().getNextServer()).toBe((winners as number[])[(winners as number[]).length - 1]);

    expect(undo()).toBe(true);
    expect(getEngineState().history.points).toHaveLength((winners as number[]).length - 1);
    expect(getEngine().getNextServer()).toBe(server);
    expect(getEngine().isServerDerived()).toBe(true);
  });
});

describe("the engine's serveSide on INTENNSE points", () => {
  it('matches the page’s aggregate-parity serve side, point by point, across a bolt boundary', () => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET2XA-S:T10', competitionFormat: INTENNSE_STANDARD });
    setServer(0);
    // the serve side each point was served from: the page's rule, read before the point
    const pageSides: string[] = [];
    let serveSide = 'DEUCE';
    const winners: (0 | 1)[] = [0, 1, 1, 0, 0];
    winners.forEach((winner, index) => {
      pageSides.push(serveSide);
      serveSide = scorePoint(winner).serveSide;
      if (index === 2) endSegment({ reason: 'bolt_expired' });
    });

    const points = getEngineState().history.points;
    expect(points.map((p: any) => String(p.serveSide).toUpperCase())).toEqual(pageSides);
    // an extra field on the points: the aggregate the page shows is unchanged by it
    expect(getAggregateScore(getEngineState())).toEqual({ side1: 3, side2: 2 });
  });
});
