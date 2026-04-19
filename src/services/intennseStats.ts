import { getTeamMatchUpState } from '../svelte/stores/teamMatchUp.svelte';
import { getEngineState } from '../svelte/stores/scoringEngine.svelte';
import { getAllCourtTimes } from '../svelte/stores/playerTime.svelte';
import { getBoxedPlayers } from '../svelte/stores/penaltyBox.svelte';

export interface PlayerStats {
  participantId: string;
  pointsWon: number;
  winners: number;
  touches: number;
  aces: number;
  unforcedErrors: number;
  forcedErrors: number;
  faults: number;
  courtTimeMs: number;
  courtTimeRemainingMs: number;
  isOnCourt: boolean;
}

export interface ParticipantDetail {
  participantName: string;
  jerseyNumber?: string;
  imageUrl?: string;
  sideNumber?: number;
}

export interface IntennseSnapshot {
  matchUpId?: string;
  tournamentId?: string;
  boltScore: { side1: number; side2: number };
  aggregateScore: { side1: number; side2: number };
  activePlayers: { side1: string[]; side2: string[] };
  playerStats: Record<string, PlayerStats>;
  penaltyBox: { participantId: string; participantName: string; remainingMs: number }[];
  /** Roster map: participantId → display-ready details (name, jersey, image).
   *  Included so arena/scorebug clients can resolve IDs without factory server access. */
  roster?: Record<string, ParticipantDetail>;
  boltTimerRemainingMs?: number;
  serveClockRemainingMs?: number;
  server: number;
  serveSide?: string;
  matchUpStatus?: string;
}

/**
 * Compute per-player INTENNSE statistics from engine point history.
 * Points carry `result`, `activePlayers`, and decorations.
 */
export function computePlayerStats(): Record<string, PlayerStats> {
  const engineState = getEngineState();
  const courtTimes = getAllCourtTimes();
  const points = engineState?.history?.points ?? [];
  const stats: Record<string, PlayerStats> = {};

  initStatsFromCourtTimes(stats, courtTimes);

  for (const point of points) {
    accumulatePoint(stats, point);
  }

  return stats;
}

function initStatsFromCourtTimes(stats: Record<string, PlayerStats>, courtTimes: Record<string, any>) {
  for (const [id, ct] of Object.entries(courtTimes)) {
    stats[id] = {
      ...createEmptyStats(id),
      courtTimeMs: ct.elapsedMs,
      courtTimeRemainingMs: ct.remainingMs,
      isOnCourt: ct.isOnCourt,
    };
  }
}

function resolvePlayer(activePlayers: any, sideIndex: number): string | undefined {
  const side = activePlayers[sideIndex];
  return Array.isArray(side) ? side[0] : side;
}

function accumulatePoint(stats: Record<string, PlayerStats>, point: any) {
  const active = point.activePlayers;
  if (!active) return;

  const winnerPlayer = resolvePlayer(active, point.winner);
  const loserPlayer = resolvePlayer(active, 1 - point.winner);

  if (winnerPlayer && !stats[winnerPlayer]) stats[winnerPlayer] = createEmptyStats(winnerPlayer);
  if (loserPlayer && !stats[loserPlayer]) stats[loserPlayer] = createEmptyStats(loserPlayer);

  if (winnerPlayer && stats[winnerPlayer]) {
    accumulateWinnerStats(stats[winnerPlayer], point);
  }
  if (loserPlayer && stats[loserPlayer]) {
    accumulateLoserStats(stats[loserPlayer], point);
  }
}

function accumulateWinnerStats(s: PlayerStats, point: any) {
  s.pointsWon += point.scoreValue ?? 1;
  if (point.result === 'Winner') s.winners++;
  else if (point.result === 'Ace') s.aces++;
  else if (point.result === 'Touch') s.touches++;
}

function accumulateLoserStats(s: PlayerStats, point: any) {
  if (point.result === 'Unforced Error') s.unforcedErrors++;
  else if (point.result === 'Forced Error') s.forcedErrors++;
}

function createEmptyStats(participantId: string): PlayerStats {
  return {
    participantId,
    pointsWon: 0,
    winners: 0,
    touches: 0,
    aces: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
    faults: 0,
    courtTimeMs: 0,
    courtTimeRemainingMs: 0,
    isOnCourt: false,
  };
}

/**
 * Build a full INTENNSE snapshot for broadcasting.
 */
export function buildIntennseSnapshot(options: {
  matchUpId?: string;
  tournamentId?: string;
  boltScore: { side1: number; side2: number };
  aggregateScore: { side1: number; side2: number };
  activePlayers: { side1: string[]; side2: string[] };
  server: number;
  serveSide?: string;
  boltTimerRemainingMs?: number;
  serveClockRemainingMs?: number;
  matchUpStatus?: string;
  /** Live rally count (increments each press, 0 when no rally in progress). */
  rallyCount?: number;
  /** The most recently scored point (result, winner, rallyLength, etc.).
   *  Consumers can use this to trigger arena effects (flash for Ace, etc.). */
  lastPoint?: Record<string, any>;
  /** Category label (e.g. "Men's Singles", "Mixed Doubles") for scorebug/video boards. */
  categoryLabel?: string;
}): IntennseSnapshot {
  return {
    ...options,
    playerStats: computePlayerStats(),
    penaltyBox: getBoxedPlayers().map((p) => ({
      participantId: p.participantId,
      participantName: p.participantName,
      remainingMs: p.remainingMs,
    })),
    roster: buildRoster(),
  };
}

/**
 * Extract roster from the team matchUp sides.
 * Each side's participant.individualParticipants carries the full
 * roster with names, person details, extensions, and onlineResources.
 */
function buildRoster(): Record<string, ParticipantDetail> | undefined {
  const { teamMatchUp } = getTeamMatchUpState();
  if (!teamMatchUp?.sides) return undefined;

  const roster: Record<string, ParticipantDetail> = {};

  for (const side of teamMatchUp.sides as any[]) {
    const sideNumber = side.sideNumber;
    const individuals = side.participant?.individualParticipants ?? [];

    for (const p of individuals) {
      roster[p.participantId] = {
        participantName: p.participantName ?? buildName(p.person),
        jerseyNumber: resolveExtension(p, 'jerseyNumber') ?? resolveExtension(p?.person, 'jerseyNumber'),
        imageUrl: resolveImageUrl(p),
        sideNumber,
      };
    }
  }

  return Object.keys(roster).length > 0 ? roster : undefined;
}

function buildName(person: any): string {
  if (!person) return '';
  return `${person.standardGivenName ?? ''} ${person.standardFamilyName ?? ''}`.trim();
}

function resolveExtension(obj: any, name: string): string | undefined {
  const ext = obj?.extensions?.find((e: any) => e.name === name);
  return ext?.value !== undefined ? String(ext.value) : undefined;
}

function resolveImageUrl(participant: any): string | undefined {
  const resources = participant?.onlineResources ?? participant?.person?.onlineResources ?? [];
  for (const r of resources) {
    if (r.resourceSubType === 'PHOTO' || r.name === 'playerImage') {
      return r.identifier ?? r.name;
    }
  }
  return undefined;
}
