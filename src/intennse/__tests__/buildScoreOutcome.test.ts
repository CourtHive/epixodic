import { describe, it, expect } from 'vitest';
import { buildScoreOutcome } from '../buildScoreOutcome';
import type { HydratedMatchUp } from '../../svelte/types';

function makeTeamMatchUp(overrides: Partial<HydratedMatchUp> = {}): HydratedMatchUp {
  return {
    matchUpId: 'team-001',
    tournamentId: 'tid-001',
    drawId: 'draw-001',
    tieMatchUps: [
      { matchUpId: 'tie-ms1', drawId: 'draw-001' },
      { matchUpId: 'tie-ws1', drawId: 'draw-001' },
    ],
    ...overrides,
  };
}

function makeEngineState(overrides: any = {}) {
  return {
    score: {
      sets: [
        { side1Score: 14, side2Score: 9, setNumber: 1 },
      ],
    },
    matchUpStatus: 'IN_PROGRESS',
    ...overrides,
  };
}

describe('buildScoreOutcome', () => {
  it('builds a valid DTO from engine state and team matchUp', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result).not.toBeNull();
    expect(result!.tournamentId).toBe('tid-001');
    expect(result!.matchUpId).toBe('tie-ms1');
    expect(result!.drawId).toBe('draw-001');
    expect(result!.outcome.matchUpStatus).toBe('IN_PROGRESS');
    expect(result!.outcome.score.sets).toHaveLength(1);
    expect(result!.outcome.winningSide).toBeUndefined();
  });

  it('returns null when tournamentId is missing (demo mode)', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: makeTeamMatchUp({ tournamentId: undefined }),
    });

    expect(result).toBeNull();
  });

  it('returns null when drawId is missing', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: makeTeamMatchUp({
        drawId: undefined,
        tieMatchUps: [{ matchUpId: 'tie-ms1' }],
      }),
    });

    expect(result).toBeNull();
  });

  it('returns null when teamMatchUp is null', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: null,
    });

    expect(result).toBeNull();
  });

  it('returns null when engineState is null', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: null,
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result).toBeNull();
  });

  it('resolves drawId from tieMatchUp when present', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: makeTeamMatchUp({
        drawId: 'parent-draw',
        tieMatchUps: [{ matchUpId: 'tie-ms1', drawId: 'tie-draw' }],
      }),
    });

    expect(result!.drawId).toBe('tie-draw');
  });

  it('falls back to parent drawId when tieMatchUp has no drawId', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState(),
      teamMatchUp: makeTeamMatchUp({
        drawId: 'parent-draw',
        tieMatchUps: [{ matchUpId: 'tie-ms1' }],
      }),
    });

    expect(result!.drawId).toBe('parent-draw');
  });

  it('sets winningSide when match is completed', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState({
        matchUpStatus: 'COMPLETED',
        score: {
          sets: [
            { side1Score: 14, side2Score: 9, setNumber: 1 },
            { side1Score: 12, side2Score: 8, setNumber: 2 },
          ],
        },
      }),
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result!.outcome.matchUpStatus).toBe('COMPLETED');
    expect(result!.outcome.winningSide).toBe(1);
  });

  it('sets winningSide to 2 when side 2 wins', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState({
        matchUpStatus: 'COMPLETED',
        score: {
          sets: [{ side1Score: 5, side2Score: 20, setNumber: 1 }],
        },
      }),
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result!.outcome.winningSide).toBe(2);
  });

  it('does not set winningSide for tied completed match', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState({
        matchUpStatus: 'COMPLETED',
        score: {
          sets: [{ side1Score: 10, side2Score: 10, setNumber: 1 }],
        },
      }),
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result!.outcome.winningSide).toBeUndefined();
  });

  it('handles empty sets array', () => {
    const result = buildScoreOutcome({
      matchUpId: 'tie-ms1',
      engineState: makeEngineState({ score: { sets: [] } }),
      teamMatchUp: makeTeamMatchUp(),
    });

    expect(result!.outcome.score.sets).toHaveLength(0);
    expect(result!.outcome.matchUpStatus).toBe('IN_PROGRESS');
  });
});
