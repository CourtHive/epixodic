import { describe, expect, it } from 'vitest';

import { supportsPointsToVisualization } from '../vizSupport';

describe('supportsPointsToVisualization (SCORING-102)', () => {
  it('rejects a missing or unparseable format', () => {
    expect(supportsPointsToVisualization(undefined)).toBe(false);
    expect(supportsPointsToVisualization('')).toBe(false);
    expect(supportsPointsToVisualization('not-a-format')).toBe(false);
  });

  it.each([
    ['SET3-S:6/TB7', true],
    ['SET3-S:TB7', true],
    ['SET3-S:TB11', true],
    ['SET3-S:4/TB5@3', true],
    ['SET5-S:5-G:3C', true],
    ['SET3XA-S:6/TB7', true],
    // a timed final set: the tiebreak sets still chart, the final set is hidden
    ['SET3-S:TB7-F:T10', true],
    // timed sets with a tiebreak final set: the final set charts
    ['SET3-S:T10-F:TB10', true],
    ['SET1-S:T10', false],
    ['SET3-S:T10', false],
    ['SET7XA-S:T10P', false],
    ['T20', false],
    ['HAL2A-S:T45', false],
    ['INN9-S:O3', false],
  ])('%s → %s', (format, expected) => {
    expect(supportsPointsToVisualization(format)).toBe(expected);
  });
});
