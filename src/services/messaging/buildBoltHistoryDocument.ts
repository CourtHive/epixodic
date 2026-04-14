import type { BoltHistoryDocument, TieMatchUpSide } from './boltHistoryDocument';
import type { HydratedMatchUp } from '../../svelte/types';
import { getBoxedPlayers } from '../../svelte/stores/penaltyBox.svelte';

/**
 * Map a tieMatchUp + its parent team matchUp into the canonical
 * BoltHistoryDocument shape that the server's IBoltHistoryStorage accepts.
 *
 * The version field is the LAST KNOWN version (managed by the caller via
 * boltHistoryApi.getKnownVersion); on first push it will be 0 and the
 * server will assign 1.
 */
export function buildBoltHistoryDocument(
  tieMatchUp: HydratedMatchUp,
  parentMatchUp: HydratedMatchUp,
  options: { version: number; scoredBy?: string },
): BoltHistoryDocument {
  const now = new Date().toISOString();

  const sides: TieMatchUpSide[] = (tieMatchUp.sides ?? []).map((side: any) => ({
    sideNumber: side?.sideNumber as 1 | 2,
    participant: side?.participant
      ? {
          participantId: side.participant.participantId,
          participantName: side.participant.participantName,
        }
      : undefined,
    lineUp: side?.lineUp,
  }));

  const tieAny = tieMatchUp as any;

  return {
    tieMatchUpId: tieMatchUp.matchUpId,
    parentMatchUpId: parentMatchUp.matchUpId,
    tournamentId: (parentMatchUp as any).tournamentId ?? (tieMatchUp as any).tournamentId ?? '',
    eventId: (parentMatchUp as any).eventId,
    drawId: (parentMatchUp as any).drawId,
    matchUpFormat: tieMatchUp.matchUpFormat,
    competitionFormat: (tieMatchUp as any).competitionFormat,
    sides,
    engineState: tieAny.engineState ?? {
      score: tieMatchUp.score,
      history: tieAny.history,
    },
    boltStarted: Boolean(tieAny.boltStarted),
    boltExpired: Boolean(tieAny.boltExpired),
    boltComplete: Boolean(tieAny.boltComplete),
    timeoutsUsed: tieAny.timeoutsUsed ?? { 1: 0, 2: 0 },
    pausedOnExit: Boolean(tieAny.pausedOnExit),
    boltClockRemainingMs: tieAny.boltClockRemainingMs,
    serveClockRemainingMs: tieAny.serveClockRemainingMs,
    playerTimeSnapshots: tieAny.playerTimeSnapshots,
    penaltyBoxSnapshots: buildPenaltyBoxSnapshots(),
    createdAt: tieAny.createdAt ?? now,
    updatedAt: now,
    scoredBy: options.scoredBy,
    version: options.version,
  };
}

function buildPenaltyBoxSnapshots():
  | Record<string, { remainingMs: number; sideNumber: 1 | 2; participantName?: string }>
  | undefined {
  const boxed = getBoxedPlayers();
  if (boxed.length === 0) return undefined;
  const out: Record<string, { remainingMs: number; sideNumber: 1 | 2; participantName?: string }> = {};
  for (const entry of boxed) {
    out[entry.participantId] = {
      remainingMs: entry.remainingMs,
      sideNumber: entry.sideNumber,
      participantName: entry.participantName,
    };
  }
  return out;
}
