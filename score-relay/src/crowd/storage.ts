/**
 * CrowdScoringStorage — Postgres persistence for crowd-sourced scoring sessions.
 *
 * Wraps a pg.Pool. Methods return domain types (CrowdScoringSession),
 * not raw rows. All writes use optimistic concurrency via the `version`
 * column; reads return the latest committed snapshot.
 *
 * Lifecycle:
 *   createSession        -> active
 *   appendPoint          -> active (version increments)
 *   cancelSession        -> cancelled-by-user
 *   cancelByMatchUpId    -> cancelled-by-td-finalize (TD-driven force-cancel)
 *   cancelStaleSince     -> cancelled-by-inactivity (background scheduler)
 *   promote              -> active, trusted = TRUE
 */

import type { Pool } from 'pg';
import type {
  AppendPointInput,
  CreateSessionInput,
  CrowdScoringSession,
  CrowdSessionStatus,
} from './types.js';
import { SessionNotFoundError, VersionConflictError } from './types.js';

const SELECT_COLS = `
  session_id, matchup_id, tournament_id, user_id, client_id, format_hint,
  current_score, point_history, trusted, trusted_by, trusted_at, status,
  version, created_at, updated_at
`;

interface SessionRow {
  session_id: string;
  matchup_id: string;
  tournament_id: string;
  user_id: string;
  client_id: string;
  format_hint: string | null;
  current_score: unknown;
  point_history: unknown;
  trusted: boolean;
  trusted_by: string | null;
  trusted_at: Date | null;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function rowToSession(row: SessionRow): CrowdScoringSession {
  return {
    sessionId: row.session_id,
    matchUpId: row.matchup_id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    clientId: row.client_id,
    formatHint: row.format_hint ?? undefined,
    currentScore: (row.current_score as CrowdScoringSession['currentScore']) ?? {},
    pointHistory: (row.point_history as CrowdScoringSession['pointHistory']) ?? [],
    trusted: row.trusted,
    trustedBy: row.trusted_by ?? undefined,
    trustedAt: row.trusted_at ?? undefined,
    status: row.status as CrowdSessionStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CrowdScoringStorage {
  constructor(private readonly pool: Pool) {}

  async createSession(input: CreateSessionInput): Promise<CrowdScoringSession> {
    const result = await this.pool.query<SessionRow>(
      `
      INSERT INTO crowd.crowd_scoring_sessions
        (session_id, matchup_id, tournament_id, user_id, client_id, format_hint, current_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING ${SELECT_COLS}
      `,
      [
        input.sessionId,
        input.matchUpId,
        input.tournamentId,
        input.userId,
        input.clientId,
        input.formatHint ?? null,
        JSON.stringify(input.currentScore),
      ],
    );
    return rowToSession(result.rows[0]);
  }

  async appendPoint(input: AppendPointInput): Promise<CrowdScoringSession> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET point_history = point_history || $3::jsonb,
             current_score = $4::jsonb,
             version       = version + 1,
             updated_at    = NOW()
       WHERE session_id = $1
         AND version    = $2
         AND status     = 'active'
      RETURNING ${SELECT_COLS}
      `,
      [
        input.sessionId,
        input.expectedVersion,
        JSON.stringify([input.point]),
        JSON.stringify(input.currentScore),
      ],
    );

    if (result.rowCount === 0) {
      await this.throwAppropriateConflict(input.sessionId, input.expectedVersion);
    }
    return rowToSession(result.rows[0]);
  }

  private async throwAppropriateConflict(sessionId: string, expectedVersion: number): Promise<never> {
    const session = await this.getById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    throw new VersionConflictError(sessionId, expectedVersion, session.version);
  }

  async getById(sessionId: string): Promise<CrowdScoringSession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT ${SELECT_COLS} FROM crowd.crowd_scoring_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ? rowToSession(result.rows[0]) : undefined;
  }

  async getByMatchUpId(matchUpId: string, options: { activeOnly?: boolean } = {}): Promise<CrowdScoringSession[]> {
    const where = options.activeOnly ? `WHERE matchup_id = $1 AND status = 'active'` : `WHERE matchup_id = $1`;
    const result = await this.pool.query<SessionRow>(
      `SELECT ${SELECT_COLS} FROM crowd.crowd_scoring_sessions ${where} ORDER BY updated_at DESC`,
      [matchUpId],
    );
    return result.rows.map(rowToSession);
  }

  async getByTournamentId(
    tournamentId: string,
    options: { trustedOnly?: boolean; activeOnly?: boolean } = {},
  ): Promise<CrowdScoringSession[]> {
    const clauses: string[] = ['tournament_id = $1'];
    if (options.trustedOnly) clauses.push('trusted = TRUE');
    if (options.activeOnly) clauses.push(`status = 'active'`);
    const where = `WHERE ${clauses.join(' AND ')}`;
    const result = await this.pool.query<SessionRow>(
      `SELECT ${SELECT_COLS} FROM crowd.crowd_scoring_sessions ${where} ORDER BY updated_at DESC`,
      [tournamentId],
    );
    return result.rows.map(rowToSession);
  }

  async promote(sessionId: string, trustedBy: string): Promise<CrowdScoringSession> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET trusted    = TRUE,
             trusted_by = $2,
             trusted_at = NOW(),
             updated_at = NOW()
       WHERE session_id = $1
      RETURNING ${SELECT_COLS}
      `,
      [sessionId, trustedBy],
    );
    if (result.rowCount === 0) throw new SessionNotFoundError(sessionId);
    return rowToSession(result.rows[0]);
  }

  async demote(sessionId: string): Promise<CrowdScoringSession> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET trusted    = FALSE,
             trusted_by = NULL,
             trusted_at = NULL,
             updated_at = NOW()
       WHERE session_id = $1
      RETURNING ${SELECT_COLS}
      `,
      [sessionId],
    );
    if (result.rowCount === 0) throw new SessionNotFoundError(sessionId);
    return rowToSession(result.rows[0]);
  }

  async cancelSession(sessionId: string): Promise<CrowdScoringSession | undefined> {
    return this.transitionStatus(sessionId, 'cancelled-by-user');
  }

  /**
   * Force-cancels every active session for a matchUp. Called by the
   * `POST /api/internal/matchup-finalized` webhook receiver when
   * competition-factory-server finalizes a matchUp.
   */
  async cancelByMatchUpId(matchUpId: string): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET status     = 'cancelled-by-td-finalize',
             updated_at = NOW()
       WHERE matchup_id = $1
         AND status     = 'active'
      `,
      [matchUpId],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Cancels every active session whose updated_at is older than the cutoff.
   * Called by the 2h inactivity background scheduler.
   */
  async cancelStaleSince(cutoff: Date): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET status     = 'cancelled-by-inactivity',
             updated_at = NOW()
       WHERE status     = 'active'
         AND updated_at < $1
      `,
      [cutoff],
    );
    return result.rowCount ?? 0;
  }

  private async transitionStatus(
    sessionId: string,
    status: CrowdSessionStatus,
  ): Promise<CrowdScoringSession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `
      UPDATE crowd.crowd_scoring_sessions
         SET status     = $2,
             updated_at = NOW()
       WHERE session_id = $1
         AND status     = 'active'
      RETURNING ${SELECT_COLS}
      `,
      [sessionId, status],
    );
    return result.rows[0] ? rowToSession(result.rows[0]) : undefined;
  }
}
