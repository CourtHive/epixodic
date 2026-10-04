/**
 * DB-free unit tests for the /crowd audience resolution — in particular the
 * CFS scorer token (`aud: score`), the epixodic launch handoff. A score token
 * is a HiveID person's own short-lived, scope-narrowed identity, so it must map
 * to the `hiveid` identity path (JWT personId is the source of truth) and never
 * to the anonymous `admin` path.
 */
import { describe, expect, it } from 'vitest';
import { resolveAudience } from './crowdNamespace.js';

describe('resolveAudience', () => {
  it('maps a scorer token (aud: score) onto the hiveid identity path', () => {
    expect(resolveAudience({ sub: 'u-1', aud: 'score', personId: 'p-1' })).toBe('hiveid');
  });

  it('keeps an explicit hiveid token as hiveid', () => {
    expect(resolveAudience({ sub: 'u-1', aud: 'hiveid', personId: 'p-1' })).toBe('hiveid');
  });

  it('keeps a provider token as provider', () => {
    expect(resolveAudience({ sub: 'provider:x', aud: 'provider', personId: 'p-1' })).toBe('provider');
  });

  it('prefers hiveid when a token carries both hiveid and score', () => {
    expect(resolveAudience({ sub: 'u-1', aud: ['hiveid', 'score'], personId: 'p-1' })).toBe('hiveid');
  });

  it('defaults an unaudienced/legacy token to admin', () => {
    expect(resolveAudience({ sub: 'u-1' })).toBe('admin');
  });
});
