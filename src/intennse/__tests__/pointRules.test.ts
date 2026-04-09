import { describe, it, expect } from 'vitest';
import { resolvePointAttribution } from '../pointRules';

describe('resolvePointAttribution', () => {
  it('winner: pressing side gets the point', () => {
    expect(resolvePointAttribution('winner', 0)).toEqual({ winner: 0, result: 'Winner' });
    expect(resolvePointAttribution('winner', 1)).toEqual({ winner: 1, result: 'Winner' });
  });

  it('ace: pressing side gets the point', () => {
    expect(resolvePointAttribution('ace', 0)).toEqual({ winner: 0, result: 'Ace' });
    expect(resolvePointAttribution('ace', 1)).toEqual({ winner: 1, result: 'Ace' });
  });

  it('touch: opponent gets 1 point (pressing side touched ball)', () => {
    expect(resolvePointAttribution('touch', 0)).toEqual({ winner: 1, result: 'Touch' });
    expect(resolvePointAttribution('touch', 1)).toEqual({ winner: 0, result: 'Touch' });
  });

  it('forcedError: opponent gets the point', () => {
    expect(resolvePointAttribution('forcedError', 0)).toEqual({ winner: 1, result: 'Forced Error' });
    expect(resolvePointAttribution('forcedError', 1)).toEqual({ winner: 0, result: 'Forced Error' });
  });

  it('unforcedError: opponent gets the point', () => {
    expect(resolvePointAttribution('unforcedError', 0)).toEqual({ winner: 1, result: 'Unforced Error' });
    expect(resolvePointAttribution('unforcedError', 1)).toEqual({ winner: 0, result: 'Unforced Error' });
  });

  it('fault: opponent gets the point', () => {
    expect(resolvePointAttribution('fault', 0)).toEqual({ winner: 1, result: 'Fault' });
    expect(resolvePointAttribution('fault', 1)).toEqual({ winner: 0, result: 'Fault' });
  });

  it('unknown action: defaults to pressing side', () => {
    expect(resolvePointAttribution('someNewAction', 0)).toEqual({ winner: 0, result: 'someNewAction' });
  });
});
