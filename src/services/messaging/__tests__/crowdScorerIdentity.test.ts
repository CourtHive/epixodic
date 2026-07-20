import { describe, it, expect } from 'vitest';
import { decodeScorerIdentity, readScorerTokenFromHash } from '../crowdScorerIdentity';

function makeJwt(payload: any): string {
  const b64 = (o: any) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('readScorerTokenFromHash', () => {
  it('reads scorerToken from a launch hash query', () => {
    expect(readScorerTokenFromHash('#/match/m-1/scoring?scorerToken=abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null when absent', () => {
    expect(readScorerTokenFromHash('#/match/m-1/scoring')).toBeNull();
    expect(readScorerTokenFromHash('')).toBeNull();
    expect(readScorerTokenFromHash('#/match/m-1/scoring?forcePortrait=1')).toBeNull();
  });
});

describe('decodeScorerIdentity', () => {
  it('decodes personId + displayName + verified from a HiveID JWT', () => {
    const identity = decodeScorerIdentity(makeJwt({ personId: 'person-1', name: 'Sam Scorer', email_verified: true }));
    expect(identity).toEqual({ token: expect.any(String), personId: 'person-1', displayName: 'Sam Scorer', verified: true });
  });

  it('falls back to sub for personId and marks unverified', () => {
    const identity = decodeScorerIdentity(makeJwt({ sub: 'user-9', email: 'a@b.com' }));
    expect(identity?.personId).toBe('user-9');
    expect(identity?.displayName).toBe('a@b.com');
    expect(identity?.verified).toBe(false);
  });

  it('returns null for an absent or undecodable token', () => {
    expect(decodeScorerIdentity(null)).toBeNull();
    expect(decodeScorerIdentity('not-a-jwt')).toBeNull();
  });
});
