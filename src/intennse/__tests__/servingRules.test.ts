import { describe, it, expect } from 'vitest';
import { getNextServer, getServeSide, getServingState } from '../servingRules';

describe('getNextServer', () => {
  it('point winner serves next', () => {
    expect(getNextServer(0, 1)).toBe(0);
    expect(getNextServer(1, 0)).toBe(1);
  });

  it('point winner serves even if already serving', () => {
    expect(getNextServer(0, 0)).toBe(0);
    expect(getNextServer(1, 1)).toBe(1);
  });

  it('fault: serve passes to opponent', () => {
    expect(getNextServer(null, 0)).toBe(1);
    expect(getNextServer(null, 1)).toBe(0);
  });
});

describe('getServeSide', () => {
  it('even aggregate total = DEUCE', () => {
    expect(getServeSide({ side1: 0, side2: 0 })).toBe('DEUCE');
    expect(getServeSide({ side1: 3, side2: 5 })).toBe('DEUCE');
    expect(getServeSide({ side1: 10, side2: 10 })).toBe('DEUCE');
  });

  it('odd aggregate total = AD', () => {
    expect(getServeSide({ side1: 1, side2: 0 })).toBe('AD');
    expect(getServeSide({ side1: 3, side2: 4 })).toBe('AD');
    expect(getServeSide({ side1: 10, side2: 11 })).toBe('AD');
  });
});

describe('getServingState', () => {
  it('returns combined server and serve side', () => {
    // Side 0 wins, aggregate 5+3=8 (even) → server 0, DEUCE
    const state = getServingState(0, 1, { side1: 5, side2: 3 });
    expect(state.server).toBe(0);
    expect(state.serveSide).toBe('DEUCE');
  });

  it('fault switches server, serve side from aggregate', () => {
    // Fault, current server 0 → server 1, aggregate 4+3=7 (odd) → AD
    const state = getServingState(null, 0, { side1: 4, side2: 3 });
    expect(state.server).toBe(1);
    expect(state.serveSide).toBe('AD');
  });

  it('0-0 aggregate = DEUCE', () => {
    const state = getServingState(0, 0, { side1: 0, side2: 0 });
    expect(state.server).toBe(0);
    expect(state.serveSide).toBe('DEUCE');
  });
});
