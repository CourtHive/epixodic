/**
 * Local mirror of the BoltHistoryDocument shape from
 * competition-factory-server/src/storage/interfaces/bolt-history.interface.ts.
 *
 * Defined here so the epixodic build doesn't have to reach across the
 * server's NestJS module graph for a type. The shape is small and
 * stable; the canonical source is the one server-side and is
 * authoritative for any field semantics.
 */

export interface TieMatchUpSide {
  sideNumber: 1 | 2;
  participant?: { participantId: string; participantName?: string };
  lineUp?: any[];
}

export interface BoltHistoryDocument {
  tieMatchUpId: string;
  parentMatchUpId: string;
  tournamentId: string;
  eventId?: string;
  drawId?: string;
  matchUpFormat?: string;
  competitionFormat?: any;
  sides: TieMatchUpSide[];
  engineState: any;
  boltStarted: boolean;
  boltExpired: boolean;
  boltComplete: boolean;
  timeoutsUsed: { 1: number; 2: number };
  pausedOnExit: boolean;
  boltClockRemainingMs?: number;
  serveClockRemainingMs?: number;
  playerTimeSnapshots?: Record<string, { elapsedMs: number; isOnCourt: boolean }>;
  createdAt: string;
  updatedAt: string;
  scoredBy?: string;
  version: number;
}
