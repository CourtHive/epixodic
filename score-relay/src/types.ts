export interface ScoreUpdate {
  matchUpId: string;
  tournamentId?: string;
  matchUpFormat?: string;
  score: {
    sets?: any[];
    scoreStringSide1?: string;
    scoreStringSide2?: string;
  };
  point?: {
    // Legacy on-wire fields (0-indexed player index).
    winner: number;
    server?: number;
    code?: string;
    result?: string;
    hand?: string;
    stroke?: string;
    rallyLength?: number;
    // CODES-aligned fields (factory `Point`). Optional + forwarded verbatim so a
    // producer can send full fidelity — notably `serverParticipantId` for doubles
    // rotation, which the legacy 0-indexed shape cannot express. When absent, the
    // relay derives winningSide/serverSideNumber from winner/server. See
    // Mentat/planning/MATCHUP_HISTORY_PERSISTENCE.md (D1).
    winningSide?: 1 | 2;
    serverSideNumber?: 1 | 2;
    serverParticipantId?: string;
    pointNumber?: number;
    timestamp?: string;
    score?: string;
  };
  matchUpStatus?: string;
  winningSide?: number;
}

export interface MatchHistory {
  matchUpId: string;
  tournamentId?: string;
  provider?: string;
  matchUpFormat?: string;
  points: any[];
  score?: any;
  sides?: any[];
}

export interface RelayConfig {
  port: number;
  factoryServerUrl?: string;
  persistScores: boolean;
  corsOrigin: string | string[];
  staleMatchHours: number;
  pruneIntervalMinutes: number;
  /** Max seconds a ticker runs without a new intennse event re-anchoring
   *  it. After this, the ticker auto-stops (the match is presumed
   *  abandoned or the tracker disconnected). Default: 1800 (30 min). */
  tickerIdleTimeoutSeconds?: number;
  /** Upstream relay URL for federation. When set, all tracker events
   *  (score, intennse, clockSync, history) are forwarded to the upstream
   *  relay's /tracker namespace. Fire-and-forget — local processing is
   *  never delayed. */
  upstreamRelayUrl?: string;
  /** Shared HS256 secret (CFS `JWT_SECRET`). When set, /tracker handshake
   *  verifies a JWT and stashes audience + tournamentId on the socket.
   *  Unset = legacy permissive mode (existing epixodic + TMX trackers
   *  keep working without auth during the rollout). */
  trackerJwtSecret?: string;
  /** ES256 public keys by `kid` for dual-accept token verification during the
   *  HS256 → ES256 signing migration. Loaded from the shared env
   *  (`JWT_PUBLIC_KEY`/`JWT_KID`); empty map = HS256-only. */
  es256Keys?: Map<string, import('node:crypto').KeyObject>;
  /** When true AND `trackerJwtSecret` is set, /tracker rejects unauthed
   *  connections. When false (default), an unauthed connection logs a
   *  deprecation warning and proceeds — the additive rollout path. */
  trackerRequireAuth?: boolean;
  /** Token-bucket cap per matchUp on /tracker. Default 10 events/sec. */
  trackerMaxEventsPerSecond?: number;
  /** Per-user fan-out ceiling on /tracker — multiplier of
   *  `trackerMaxEventsPerSecond`. Default 5 → 50 ev/s across all
   *  matchUps a single token holder can publish to. Closes the
   *  cross-matchUp bypass flagged in the 2026-05-31 punch list. */
  trackerUserFanoutMultiplier?: number;
  /** Per-IP connect-rate cap on /tracker. Default 60/min. Caps the
   *  previously-unlimited handshake — defense-in-depth against
   *  connection floods (legit reconnect storms stay well under). */
  trackerMaxConnectsPerMinute?: number;
}

export interface RelayMetrics {
  trackers: number;
  listeners: number;
  activeMatches: number;
  scoresRelayed: number;
  uptimeSeconds: number;
}
