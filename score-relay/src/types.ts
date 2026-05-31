export interface ScoreUpdate {
  matchUpId: string;
  tournamentId?: string;
  score: {
    sets?: any[];
    scoreStringSide1?: string;
    scoreStringSide2?: string;
  };
  point?: {
    winner: number;
    server?: number;
    code?: string;
    result?: string;
    hand?: string;
    stroke?: string;
    rallyLength?: number;
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
  /** When true AND `trackerJwtSecret` is set, /tracker rejects unauthed
   *  connections. When false (default), an unauthed connection logs a
   *  deprecation warning and proceeds — the additive rollout path. */
  trackerRequireAuth?: boolean;
  /** Token-bucket cap per matchUp on /tracker. Default 10 events/sec. */
  trackerMaxEventsPerSecond?: number;
}

export interface RelayMetrics {
  trackers: number;
  listeners: number;
  activeMatches: number;
  scoresRelayed: number;
  uptimeSeconds: number;
}
