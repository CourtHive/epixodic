import { describe, it, expect } from 'vitest';
import { getCurrentBoltScore, getAggregateScore } from '../scoreComputation';

describe('getCurrentBoltScore', () => {
  it('returns zeros for null/undefined state', () => {
    expect(getCurrentBoltScore(null)).toEqual({ side1: 0, side2: 0 });
    expect(getCurrentBoltScore(undefined)).toEqual({ side1: 0, side2: 0 });
  });

  it('returns zeros when no sets', () => {
    expect(getCurrentBoltScore({ score: { sets: [] } })).toEqual({ side1: 0, side2: 0 });
    expect(getCurrentBoltScore({ score: {} })).toEqual({ side1: 0, side2: 0 });
  });

  it('returns the last set scores', () => {
    const state = {
      score: {
        sets: [
          { side1Score: 10, side2Score: 8 },
          { side1Score: 3, side2Score: 5 },
        ],
      },
    };
    expect(getCurrentBoltScore(state)).toEqual({ side1: 3, side2: 5 });
  });

  it('handles missing score properties', () => {
    const state = { score: { sets: [{ side1Score: 4 }] } };
    expect(getCurrentBoltScore(state)).toEqual({ side1: 4, side2: 0 });
  });
});

describe('getAggregateScore', () => {
  it('returns zeros for null/undefined state', () => {
    expect(getAggregateScore(null)).toEqual({ side1: 0, side2: 0 });
    expect(getAggregateScore(undefined)).toEqual({ side1: 0, side2: 0 });
  });

  it('returns zeros when no sets', () => {
    expect(getAggregateScore({ score: { sets: [] } })).toEqual({ side1: 0, side2: 0 });
  });

  it('sums across all sets', () => {
    const state = {
      score: {
        sets: [
          { side1Score: 10, side2Score: 8 },
          { side1Score: 3, side2Score: 5 },
          { side1Score: 7, side2Score: 6 },
        ],
      },
    };
    expect(getAggregateScore(state)).toEqual({ side1: 20, side2: 19 });
  });

  it('handles single set', () => {
    const state = { score: { sets: [{ side1Score: 4, side2Score: 2 }] } };
    expect(getAggregateScore(state)).toEqual({ side1: 4, side2: 2 });
  });
});
