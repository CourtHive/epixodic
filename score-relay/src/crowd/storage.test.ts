/**
 * CrowdScoringStorage integration tests.
 *
 * Requires a real Postgres instance. Provide CROWD_POSTGRES_URL_TEST to
 * exercise — otherwise the suite skips. Each test truncates the table
 * between runs; the schema is bootstrapped via runMigrations(). Per
 * CourtHive standards, no mocks of the database — the prior memory
 * `feedback_no_mock_db_in_integration_tests` applies.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrationRunner.js';
import { CrowdScoringStorage } from './storage.js';
import { SessionNotFoundError, VersionConflictError } from './types.js';

const TEST_URL = process.env.CROWD_POSTGRES_URL_TEST;
const suite = TEST_URL ? describe : describe.skip;

suite('CrowdScoringStorage', () => {
  let pool: Pool;
  let storage: CrowdScoringStorage;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await runMigrations(pool, { logger: () => {} });
    storage = new CrowdScoringStorage(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE crowd.crowd_scoring_sessions');
  });

  function newSessionInput(overrides: Partial<Parameters<CrowdScoringStorage['createSession']>[0]> = {}) {
    const id = `sess-${Math.random().toString(36).slice(2, 10)}`;
    return {
      sessionId: id,
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      userId: 'user-alice',
      clientId: 'client-fingerprint-abc',
      formatHint: 'SET3-S:6/TB7',
      currentScore: { sets: [], pointDisplay: ['0', '0'] as [string, string] },
      ...overrides,
    };
  }

  describe('createSession', () => {
    it('persists a new session with version 0 and active status', async () => {
      const input = newSessionInput();
      const session = await storage.createSession(input);

      expect(session.sessionId).toBe(input.sessionId);
      expect(session.matchUpId).toBe(input.matchUpId);
      expect(session.userId).toBe(input.userId);
      expect(session.status).toBe('active');
      expect(session.version).toBe(0);
      expect(session.trusted).toBe(false);
      expect(session.pointHistory).toEqual([]);
      expect(session.currentScore).toEqual(input.currentScore);
    });
  });

  describe('appendPoint', () => {
    it('appends a point, bumps version, and updates current_score', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());

      const next = await storage.appendPoint({
        sessionId,
        expectedVersion: 0,
        point: { winner: 1, server: 1, result: 'Winner', recordedAt: '2026-05-15T03:00:00Z' },
        currentScore: { sets: [{ setNumber: 1, side1Score: 0, side2Score: 0 }], pointDisplay: ['15', '0'] },
      });

      expect(next.version).toBe(1);
      expect(next.pointHistory).toHaveLength(1);
      expect(next.pointHistory[0].winner).toBe(1);
      expect(next.currentScore.pointDisplay).toEqual(['15', '0']);
    });

    it('throws VersionConflictError on stale expectedVersion', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());

      await storage.appendPoint({
        sessionId,
        expectedVersion: 0,
        point: { winner: 1, recordedAt: '2026-05-15T03:00:00Z' },
        currentScore: {},
      });

      await expect(
        storage.appendPoint({
          sessionId,
          expectedVersion: 0,
          point: { winner: 2, recordedAt: '2026-05-15T03:00:01Z' },
          currentScore: {},
        }),
      ).rejects.toBeInstanceOf(VersionConflictError);
    });

    it('throws SessionNotFoundError when the session does not exist', async () => {
      await expect(
        storage.appendPoint({
          sessionId: 'sess-missing',
          expectedVersion: 0,
          point: { winner: 1, recordedAt: '2026-05-15T03:00:00Z' },
          currentScore: {},
        }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it('refuses to append on a cancelled session (treated as conflict)', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());
      await storage.cancelSession(sessionId);

      // The session exists but is no longer active — the WHERE clause filters it,
      // so the engine ends up reporting a VersionConflictError after re-reading.
      await expect(
        storage.appendPoint({
          sessionId,
          expectedVersion: 0,
          point: { winner: 1, recordedAt: '2026-05-15T03:00:00Z' },
          currentScore: {},
        }),
      ).rejects.toBeInstanceOf(VersionConflictError);
    });
  });

  describe('queries', () => {
    it('getByMatchUpId returns all sessions for a matchUp, newest first', async () => {
      const a = await storage.createSession(newSessionInput({ matchUpId: 'mu-A' }));
      await storage.createSession(newSessionInput({ matchUpId: 'mu-other' }));
      const b = await storage.createSession(newSessionInput({ matchUpId: 'mu-A' }));

      const result = await storage.getByMatchUpId('mu-A');
      expect(result.map((s) => s.sessionId)).toEqual([b.sessionId, a.sessionId]);
    });

    it('getByMatchUpId activeOnly filters out cancelled sessions', async () => {
      const a = await storage.createSession(newSessionInput({ matchUpId: 'mu-A' }));
      const b = await storage.createSession(newSessionInput({ matchUpId: 'mu-A' }));
      await storage.cancelSession(a.sessionId);

      const result = await storage.getByMatchUpId('mu-A', { activeOnly: true });
      expect(result.map((s) => s.sessionId)).toEqual([b.sessionId]);
    });

    it('getByTournamentId trustedOnly returns promoted sessions only', async () => {
      const a = await storage.createSession(newSessionInput({ tournamentId: 'tour-X' }));
      await storage.createSession(newSessionInput({ tournamentId: 'tour-X' }));
      await storage.promote(a.sessionId, 'td-bob');

      const result = await storage.getByTournamentId('tour-X', { trustedOnly: true });
      expect(result.map((s) => s.sessionId)).toEqual([a.sessionId]);
      expect(result[0].trusted).toBe(true);
      expect(result[0].trustedBy).toBe('td-bob');
    });
  });

  describe('promote/demote', () => {
    it('promote flips trusted=TRUE and records trusted_by/trusted_at', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());
      const promoted = await storage.promote(sessionId, 'td-bob');

      expect(promoted.trusted).toBe(true);
      expect(promoted.trustedBy).toBe('td-bob');
      expect(promoted.trustedAt).toBeInstanceOf(Date);
    });

    it('demote clears trusted_by/trusted_at', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());
      await storage.promote(sessionId, 'td-bob');
      const demoted = await storage.demote(sessionId);

      expect(demoted.trusted).toBe(false);
      expect(demoted.trustedBy).toBeUndefined();
      expect(demoted.trustedAt).toBeUndefined();
    });

    it('promote throws SessionNotFoundError when missing', async () => {
      await expect(storage.promote('sess-missing', 'td-bob')).rejects.toBeInstanceOf(SessionNotFoundError);
    });
  });

  describe('cancellation paths', () => {
    it('cancelSession transitions to cancelled-by-user', async () => {
      const { sessionId } = await storage.createSession(newSessionInput());
      const cancelled = await storage.cancelSession(sessionId);
      expect(cancelled?.status).toBe('cancelled-by-user');
    });

    it('cancelByMatchUpId cancels every active session for a matchUp', async () => {
      await storage.createSession(newSessionInput({ matchUpId: 'mu-finalize' }));
      await storage.createSession(newSessionInput({ matchUpId: 'mu-finalize' }));
      await storage.createSession(newSessionInput({ matchUpId: 'mu-other' }));

      const cancelled = await storage.cancelByMatchUpId('mu-finalize');
      expect(cancelled).toBe(2);

      const remaining = await storage.getByMatchUpId('mu-finalize', { activeOnly: true });
      expect(remaining).toHaveLength(0);

      const otherStillActive = await storage.getByMatchUpId('mu-other', { activeOnly: true });
      expect(otherStillActive).toHaveLength(1);
    });

    it('cancelStaleSince cancels sessions older than cutoff', async () => {
      const fresh = await storage.createSession(newSessionInput());
      const stale = await storage.createSession(newSessionInput());

      // Manually backdate the stale row's updated_at
      await pool.query(
        `UPDATE crowd.crowd_scoring_sessions SET updated_at = NOW() - INTERVAL '3 hours' WHERE session_id = $1`,
        [stale.sessionId],
      );

      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cancelled = await storage.cancelStaleSince(cutoff);
      expect(cancelled).toBe(1);

      const staleRow = await storage.getById(stale.sessionId);
      expect(staleRow?.status).toBe('cancelled-by-inactivity');

      const freshRow = await storage.getById(fresh.sessionId);
      expect(freshRow?.status).toBe('active');
    });
  });

  describe('runMigrations', () => {
    it('is idempotent — running twice does not error', async () => {
      await runMigrations(pool, { logger: () => {} });
      await runMigrations(pool, { logger: () => {} });

      const result = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM crowd.schema_migrations',
      );
      expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(1);
    });
  });
});
