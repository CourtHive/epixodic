/**
 * Crowd scoring types — Phase 3 foundation.
 *
 * Crowd scoring captures unofficial point-by-point streams from
 * authenticated visitors on courthive-public. These are never
 * displayed as authoritative scores; they feed a future predictive
 * scheduling layer.
 *
 * Authoritative tournament data lives in competition-factory-server.
 * Crowd data lives here in score-relay, on its own Postgres schema
 * (`crowd`) for hard separation. See Decision 6 in
 * `Mentat/planning/COURTHIVE_PUBLIC_INTERACTIVE_TRACKING.md`.
 */

export type CrowdSessionStatus =
  | 'active'
  | 'cancelled-by-user'
  | 'cancelled-by-inactivity'
  | 'cancelled-by-td-finalize';

/**
 * Identity of whoever submitted the points in a crowd session, when known.
 * Populated for HiveID-authenticated visitors on courthive-public (Phase 5
 * of the HiveID integration). The JWT-derived `personId` is the source of
 * truth on hiveid-aud sessions; admin-aud sessions may carry a client-supplied
 * attribution (TD scoring on behalf of someone, for example). Anonymous /
 * legacy admin sessions leave `crowdScoredBy` undefined.
 */
export interface CrowdScorerAttribution {
  /** Canonical Person id from courthive-persons, or null when unknown. */
  personId: string | null;
  /** Cached display name from the JWT or admin-side input. */
  displayName: string;
  /** Source of trust for the attribution. */
  audience: 'admin' | 'hiveid' | 'provider';
  /**
   * Whether the scorer's email is verified (from the hiveid JWT's
   * `email_verified` claim). TMX gates scorer-nomination on this — only
   * verified persons may be nominated. False for unverified / admin-attributed.
   */
  verified: boolean;
}

/**
 * Compact per-point log entry. Stored in JSONB.
 * Shape is intentionally loose — the engine's getScore() output is
 * format-agnostic, and we never re-derive state from these points
 * server-side (the client is authoritative for its own session).
 */
export interface CrowdPoint {
  /** Side that won the point: 1 or 2 */
  winner: 1 | 2;
  /** Optional server annotation (1 or 2). May be missing for side-out formats. */
  server?: 1 | 2;
  /** Optional point result classification ('Winner', 'UnforcedError', etc.) */
  result?: string;
  /** Wall clock when the point was recorded on the client (ISO 8601). */
  recordedAt: string;
}

/**
 * Snapshot of the engine's current score. Stored in JSONB.
 * Loose shape — the consumer (predictive scheduler) reads whichever
 * fields it needs and ignores the rest.
 */
export interface CrowdScoreSnapshot {
  /** Set scores so far. */
  sets?: Array<{
    setNumber: number;
    side1Score: number;
    side2Score: number;
    side1TiebreakScore?: number;
    side2TiebreakScore?: number;
    winningSide?: 1 | 2;
  }>;
  /** Current game point display (raw strings as the engine reports them). */
  pointDisplay?: [string, string];
  /** Match-level winning side, when known. */
  winningSide?: 1 | 2;
  /** Engine's scoreboard string. */
  scoreboard?: string;
}

export interface CrowdScoringSession {
  sessionId: string;
  matchUpId: string;
  tournamentId: string;
  /** JWT subject (auth user id). Always present — anonymous sessions never reach storage. */
  userId: string;
  /** Browser device fingerprint. Distinguishes multiple devices for the same user. */
  clientId: string;
  /** Optional format hint (e.g. matchUpFormat code or 'INTENNSE'). */
  formatHint?: string;
  /** Current engine score snapshot. */
  currentScore: CrowdScoreSnapshot;
  /** Per-point history. */
  pointHistory: CrowdPoint[];
  /** TD-promoted feeds may be consumed by predictive scheduling. */
  trusted: boolean;
  trustedBy?: string;
  trustedAt?: Date;
  /** Lifecycle status. */
  status: CrowdSessionStatus;
  /** Optimistic concurrency token; increments on every appendPoint. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** HiveID-or-admin attribution, when known. See `CrowdScorerAttribution`. */
  crowdScoredBy?: CrowdScorerAttribution;
}

export interface CreateSessionInput {
  sessionId: string;
  matchUpId: string;
  tournamentId: string;
  userId: string;
  clientId: string;
  formatHint?: string;
  currentScore: CrowdScoreSnapshot;
  /** Optional attribution stamped at session creation; not mutable after. */
  crowdScoredBy?: CrowdScorerAttribution;
}

export interface AppendPointInput {
  sessionId: string;
  /** Caller's view of the current version; the write fails on mismatch. */
  expectedVersion: number;
  point: CrowdPoint;
  currentScore: CrowdScoreSnapshot;
}

export class VersionConflictError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `version conflict on crowd session ${sessionId}: expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = 'VersionConflictError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`crowd session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}
