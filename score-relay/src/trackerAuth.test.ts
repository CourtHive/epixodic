import { describe, expect, it } from 'vitest';
import { signHs256 } from './crowd/jwtVerify.js';
import {
  resolveTrackerAudience,
  TrackerAuthError,
  verifyTrackerToken,
} from './trackerAuth.js';

const SECRET = 'tracker-test-secret';

describe('trackerAuth', () => {
  describe('verifyTrackerToken', () => {
    it('accepts an admin-aud token and exposes userId', () => {
      const token = signHs256({ sub: 'u-td-alice', aud: 'admin' }, SECRET);
      const data = verifyTrackerToken(token, SECRET);
      expect(data).toEqual({ userId: 'u-td-alice', audience: 'admin' });
    });

    it('accepts a score-aud token with a tournamentId claim', () => {
      const token = signHs256(
        { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-abc' },
        SECRET,
      );
      const data = verifyTrackerToken(token, SECRET);
      expect(data).toEqual({ userId: 'svc-ionsport', audience: 'score', tournamentId: 't-abc' });
    });

    it('rejects a score-aud token without a tournamentId claim', () => {
      const token = signHs256({ sub: 'svc', aud: 'score' }, SECRET);
      expect(() => verifyTrackerToken(token, SECRET)).toThrowError(/missing-tournament-id/);
    });

    it('rejects a token with a non-admin/non-score audience', () => {
      const token = signHs256({ sub: 'u', aud: 'hiveid' }, SECRET);
      expect(() => verifyTrackerToken(token, SECRET)).toThrowError(/audience-mismatch/);
    });

    it('rejects a token without sub', () => {
      const token = signHs256({ aud: 'admin' }, SECRET);
      expect(() => verifyTrackerToken(token, SECRET)).toThrowError(/missing-sub/);
    });

    it('wraps verifier errors as TrackerAuthError', () => {
      expect(() => verifyTrackerToken('garbage', SECRET)).toThrow(TrackerAuthError);
    });

    it('treats a missing aud as admin (legacy back-compat)', () => {
      const token = signHs256({ sub: 'u-legacy' }, SECRET);
      const data = verifyTrackerToken(token, SECRET);
      expect(data.audience).toBe('admin');
    });

    it('promotes score over admin when both are present', () => {
      const token = signHs256(
        { sub: 'u', aud: ['admin', 'score'], tournamentId: 't' },
        SECRET,
      );
      const data = verifyTrackerToken(token, SECRET);
      expect(data.audience).toBe('score');
      expect(data.tournamentId).toBe('t');
    });
  });

  describe('resolveTrackerAudience', () => {
    it('returns admin by default', () => {
      expect(resolveTrackerAudience(undefined)).toBe('admin');
      expect(resolveTrackerAudience(null)).toBe('admin');
      expect(resolveTrackerAudience('')).toBe('admin');
      expect(resolveTrackerAudience([])).toBe('admin');
    });

    it('returns score when score is in the list', () => {
      expect(resolveTrackerAudience('score')).toBe('score');
      expect(resolveTrackerAudience(['admin', 'score'])).toBe('score');
    });

    it('returns admin for an unknown aud', () => {
      expect(resolveTrackerAudience('mystery')).toBe('admin');
    });
  });
});
