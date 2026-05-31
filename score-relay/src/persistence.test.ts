import { describe, expect, it } from 'vitest';
import { buildScorePayload } from './persistence.js';
import type { MatchHistory } from './types.js';

const baseHistory: MatchHistory = {
  matchUpId: 'mu-1',
  tournamentId: 't-abc',
  matchUpFormat: 'SET3-S:6/TB7',
  points: [],
};

describe('buildScorePayload', () => {
  it('produces a flat SetMatchUpStatusDto with outcome block', () => {
    const payload = buildScorePayload({
      ...baseHistory,
      score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }], winningSide: 1 },
    });
    expect(payload).toEqual({
      tournamentId: 't-abc',
      matchUpId: 'mu-1',
      matchUpFormat: 'SET3-S:6/TB7',
      outcome: {
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        matchUpFormat: 'SET3-S:6/TB7',
        score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }] },
      },
    });
  });

  it('marks matchUpStatus IN_PROGRESS when winningSide is unset', () => {
    const payload = buildScorePayload({ ...baseHistory, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } });
    expect(payload.outcome.matchUpStatus).toBe('IN_PROGRESS');
    expect(payload.outcome.winningSide).toBeUndefined();
  });

  it('omits outcome.score when no sets are present', () => {
    const payload = buildScorePayload({ ...baseHistory, score: { winningSide: 2 } });
    expect(payload.outcome.score).toBeUndefined();
    expect(payload.outcome.winningSide).toBe(2);
  });

  it('does not emit drawId — CFS resolves it server-side', () => {
    const payload = buildScorePayload(baseHistory) as Record<string, unknown>;
    expect('drawId' in payload).toBe(false);
  });
});
