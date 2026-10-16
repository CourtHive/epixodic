import { beforeEach, describe, expect, it, vi } from 'vitest';

// The standard (non-INTENNSE) path asks the factory for the tie score; the
// sequence of results it returns is set per test.
const { tieResults } = vi.hoisted(() => ({ tieResults: [] as any[] }));
vi.mock('tods-competition-factory', () => ({
  scoreGovernor: { generateTieMatchUpScore: () => tieResults.shift() ?? {} },
}));
vi.mock('../../../state/browserStorage', () => ({ browserStorage: { get: () => undefined, set: () => {} } }));
vi.mock('../../../services/messaging/matchUpHistoryApi', () => ({
  getKnownVersion: () => 0,
  setKnownVersion: () => {},
  pushBoltHistoryWithRetry: async () => ({}),
}));
vi.mock('../../../services/auth/loginState', () => ({ getLoginState: () => undefined }));

import { getTeamMatchUpState, recalculateTeamScore, setTeamMatchUp } from '../teamMatchUp.svelte';

function bolt(matchUpStatus: string, side1Score: number, side2Score: number): any {
  return { matchUpId: `b-${side1Score}-${side2Score}`, matchUpStatus, score: { sets: [{ side1Score, side2Score }] } };
}

const team = () => getTeamMatchUpState().teamMatchUp as any;

describe('team result recalculation clears an obsolete winner', () => {
  beforeEach(() => {
    tieResults.length = 0;
  });

  it('INTENNSE: a completed result corrected back to in progress has no winner', () => {
    setTeamMatchUp({ matchUpId: 'team-i', matchUpFormat: 'XA-S:T10P', tieMatchUps: [bolt('COMPLETED', 10, 5)] } as any);
    recalculateTeamScore();
    expect(team().winningSide).toBe(1);

    team().tieMatchUps[0].matchUpStatus = 'IN_PROGRESS';
    recalculateTeamScore();
    expect(team().winningSide).toBeUndefined();
    expect(team().score.sets[0].winningSide).toBeUndefined();
  });

  it('INTENNSE: a completed result corrected to a level total has no winner', () => {
    setTeamMatchUp({ matchUpId: 'team-t', matchUpFormat: 'XA-S:T10P', tieMatchUps: [bolt('COMPLETED', 10, 5)] } as any);
    recalculateTeamScore();
    team().tieMatchUps[0].score.sets[0].side2Score = 10;
    recalculateTeamScore();
    expect(team().winningSide).toBeUndefined();
  });

  it('INTENNSE: a corrected result that changes the winner takes the new winner', () => {
    setTeamMatchUp({ matchUpId: 'team-c', matchUpFormat: 'XA-S:T10P', tieMatchUps: [bolt('COMPLETED', 10, 5)] } as any);
    recalculateTeamScore();
    team().tieMatchUps[0].score.sets[0].side2Score = 12;
    recalculateTeamScore();
    expect(team().winningSide).toBe(2);
  });

  it('standard: a decided tie score corrected to undecided has no winner', () => {
    setTeamMatchUp({ matchUpId: 'team-s', matchUpFormat: 'SET3-S:6/TB7', tieMatchUps: [] } as any);
    tieResults.push(
      { set: { side1Score: 3, side2Score: 1 }, winningSide: 1, scoreStringSide1: '3-1', scoreStringSide2: '1-3' },
      { set: { side1Score: 2, side2Score: 2 }, scoreStringSide1: '2-2', scoreStringSide2: '2-2' },
    );
    recalculateTeamScore();
    expect(team().winningSide).toBe(1);
    recalculateTeamScore();
    expect(team().winningSide).toBeUndefined();
  });
});
