import { describe, expect, it } from 'vitest';
import { resolveTrackerSecret } from './trackerSecret.js';

describe('resolveTrackerSecret', () => {
  it('reads JWT_SECRET, the secret /crowd uses', () => {
    expect(resolveTrackerSecret({ JWT_SECRET: 'shared' })).toEqual({ secret: 'shared', source: 'JWT_SECRET' });
  });

  it('returns no secret when neither variable is set', () => {
    expect(resolveTrackerSecret({})).toEqual({});
    expect(resolveTrackerSecret({ JWT_SECRET: '  ', TRACKER_JWT_SECRET: '' })).toEqual({});
  });

  it('keeps TRACKER_JWT_SECRET as an override and calls it redundant when it equals JWT_SECRET', () => {
    const result = resolveTrackerSecret({ JWT_SECRET: 'shared', TRACKER_JWT_SECRET: ' shared ' });
    expect(result.secret).toBe('shared');
    expect(result.source).toBe('TRACKER_JWT_SECRET');
    expect(result.warning).toMatch(/equals JWT_SECRET/);
  });

  it('keeps a diverged TRACKER_JWT_SECRET and says so', () => {
    const result = resolveTrackerSecret({ JWT_SECRET: 'shared', TRACKER_JWT_SECRET: 'other' });
    expect(result.secret).toBe('other');
    expect(result.warning).toMatch(/DIFFERS from JWT_SECRET/);
  });

  it('accepts TRACKER_JWT_SECRET alone, with a deprecation warning', () => {
    const result = resolveTrackerSecret({ TRACKER_JWT_SECRET: 'legacy' });
    expect(result.secret).toBe('legacy');
    expect(result.warning).toMatch(/set JWT_SECRET/);
  });
});
