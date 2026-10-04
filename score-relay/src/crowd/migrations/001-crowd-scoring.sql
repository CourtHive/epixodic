-- Crowd scoring storage — Phase 3 foundation.
--
-- Decision 6 (planning/COURTHIVE_PUBLIC_INTERACTIVE_TRACKING.md):
--   "score-relay owns crowd writes, NOT competition-factory-server.
--    Logical separation at the database level via its own `crowd` schema —
--    physical separation possible later if scale demands."
--
-- DDL is idempotent so the runner records this migration cleanly on first
-- run even if the schema was hand-bootstrapped during dev iteration.

CREATE SCHEMA IF NOT EXISTS crowd;

CREATE TABLE IF NOT EXISTS crowd.crowd_scoring_sessions (
  session_id      TEXT PRIMARY KEY,
  matchup_id      TEXT NOT NULL,
  tournament_id   TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  format_hint     TEXT,
  current_score   JSONB NOT NULL DEFAULT '{}'::jsonb,
  point_history   JSONB NOT NULL DEFAULT '[]'::jsonb,
  trusted         BOOLEAN NOT NULL DEFAULT FALSE,
  trusted_by      TEXT,
  trusted_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active',
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by matchUp (TD view of "what's being tracked for this matchUp")
CREATE INDEX IF NOT EXISTS idx_crowd_matchup
  ON crowd.crowd_scoring_sessions (matchup_id);

-- Lookup by tournament (predictive scheduling sweep)
CREATE INDEX IF NOT EXISTS idx_crowd_tournament
  ON crowd.crowd_scoring_sessions (tournament_id);

-- Trusted partial index — predictive scheduling only cares about trusted feeds
CREATE INDEX IF NOT EXISTS idx_crowd_trusted
  ON crowd.crowd_scoring_sessions (matchup_id)
  WHERE trusted = TRUE;

-- Stale-session sweep — 2h inactivity scheduler scans by updated_at on active rows
CREATE INDEX IF NOT EXISTS idx_crowd_active_updated_at
  ON crowd.crowd_scoring_sessions (updated_at)
  WHERE status = 'active';
