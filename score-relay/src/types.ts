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
}

export interface RelayMetrics {
  trackers: number;
  listeners: number;
  activeMatches: number;
  scoresRelayed: number;
  uptimeSeconds: number;
}
