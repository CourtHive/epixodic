import { Clock } from '../../clock/Clock';

/**
 * Tracks cumulative court time per player across Bolts within a format.
 * INTENNSE rule: each player credited N minutes per Bolt in the format,
 * e.g., men's singles = 2 Bolts × 6 min/Bolt = 12 min max across both Bolts.
 *
 * Time tracking uses individual Clock instances in 'up' direction.
 * When a player is on court, their clock runs. When subbed out, it pauses.
 */

interface PlayerTimeEntry {
  participantId: string;
  participantName: string;
  gender?: string;
  jerseyNumber?: string;
  clock: Clock;
  isOnCourt: boolean;
}

let players = $state<Record<string, PlayerTimeEntry>>({});
let maxCourtTimeMs = $state(12 * 60 * 1000); // default 12 minutes
let version = $state(0);

function bump() { version++; }

export function getPlayerTimeState() {
  return {
    get players() { return players; },
    get maxCourtTimeMs() { return maxCourtTimeMs; },
    get version() { return version; },
  };
}

export function setMaxCourtTime(ms: number) {
  maxCourtTimeMs = ms;
}

export function registerPlayer(participantId: string, participantName: string, gender?: string, jerseyNumber?: string) {
  if (players[participantId]) return;
  players[participantId] = {
    participantId,
    participantName,
    jerseyNumber,
    gender,
    clock: new Clock({
      id: `playerTime-${participantId}`,
      durationMs: Number.MAX_SAFE_INTEGER, // count up, no expiry
      direction: 'up',
      tickIntervalMs: 1000,
      onTick: () => bump(),
    }),
    isOnCourt: false,
  };
}

export function registerPlayers(roster: { participantId: string; participantName: string; gender?: string; jerseyNumber?: string }[]) {
  for (const p of roster) {
    registerPlayer(p.participantId, p.participantName, p.gender, p.jerseyNumber);
  }
}

export function startTracking(participantId: string) {
  const entry = players[participantId];
  if (!entry || entry.isOnCourt) return;
  entry.isOnCourt = true;
  entry.clock.start();
  bump();
}

export function stopTracking(participantId: string) {
  const entry = players[participantId];
  if (!entry || !entry.isOnCourt) return;
  entry.isOnCourt = false;
  entry.clock.pause();
  bump();
}

/** Mark player as on court without starting their clock (used when bolt hasn't started) */
export function setOnCourt(participantId: string) {
  const entry = players[participantId];
  if (!entry || entry.isOnCourt) return;
  entry.isOnCourt = true;
  bump();
}

/** Pause clocks for all on-court players without changing isOnCourt status */
export function pauseAllOnCourtClocks() {
  for (const entry of Object.values(players)) {
    if (entry.isOnCourt) entry.clock.pause();
  }
  bump();
}

/** Resume clocks for all on-court players */
export function resumeAllOnCourtClocks() {
  for (const entry of Object.values(players)) {
    if (entry.isOnCourt) entry.clock.start();
  }
  bump();
}

/** Snapshot of all player elapsed times — used for cross-navigation persistence */
export function getPlayerTimeSnapshots(): Record<string, { elapsedMs: number; isOnCourt: boolean }> {
  const result: Record<string, { elapsedMs: number; isOnCourt: boolean }> = {};
  for (const [id, entry] of Object.entries(players)) {
    result[id] = {
      elapsedMs: entry.clock.getElapsedMs(),
      isOnCourt: entry.isOnCourt,
    };
  }
  return result;
}

/** Restore player elapsed times from a previous snapshot. Clocks are left paused.
 *
 * NOTE: `isOnCourt` is deliberately **not** restored from the snapshot. The
 * authoritative source of who is active is the tieMatchUp's side participant
 * IDs (applied via `setOnCourt` in `initTeamRosters`). Restoring `isOnCourt`
 * from the snapshot would re-introduce any historical corruption (e.g. a
 * prior cross-tieMatchUp state bleed that left >2 players flagged as on
 * court) into a freshly mounted bolt. Time accounting still flows through.
 */
export function restorePlayerTimeSnapshots(
  snapshots: Record<string, { elapsedMs: number; isOnCourt?: boolean }>,
) {
  for (const [id, snap] of Object.entries(snapshots)) {
    const entry = players[id];
    if (!entry) continue;
    // Transition idle → running → paused so the clock is in paused state
    // (Clock.pause() is a no-op from idle, and setRemainingMs requires non-running)
    entry.clock.start();
    entry.clock.pause();
    // For count-up clocks: remaining = maxSafe - elapsed
    entry.clock.setRemainingMs(Number.MAX_SAFE_INTEGER - snap.elapsedMs);
  }
  bump();
}

export function getCourtTimeMs(participantId: string): number {
  return players[participantId]?.clock.getElapsedMs() ?? 0;
}

export function getRemainingMs(participantId: string): number {
  const elapsed = getCourtTimeMs(participantId);
  return Math.max(0, maxCourtTimeMs - elapsed);
}

export function isTimeExhausted(participantId: string): boolean {
  return getRemainingMs(participantId) <= 0;
}

export function checkTimeLimit(participantId: string): {
  exceeded: boolean;
  remainingMs: number;
  elapsedMs: number;
} {
  const elapsed = getCourtTimeMs(participantId);
  const remaining = Math.max(0, maxCourtTimeMs - elapsed);
  return { exceeded: remaining <= 0, remainingMs: remaining, elapsedMs: elapsed };
}

export function getAllCourtTimes(): Record<string, { elapsedMs: number; remainingMs: number; isOnCourt: boolean }> {
  const result: Record<string, { elapsedMs: number; remainingMs: number; isOnCourt: boolean }> = {};
  for (const [id, entry] of Object.entries(players)) {
    const elapsed = entry.clock.getElapsedMs();
    result[id] = {
      elapsedMs: elapsed,
      remainingMs: Math.max(0, maxCourtTimeMs - elapsed),
      isOnCourt: entry.isOnCourt,
    };
  }
  return result;
}

export function getOnCourtPlayers(side?: 1 | 2, sideRoster?: Record<string, 1 | 2>): PlayerTimeEntry[] {
  return Object.values(players).filter((p) => {
    if (!p.isOnCourt) return false;
    if (side !== undefined && sideRoster) {
      return sideRoster[p.participantId] === side;
    }
    return true;
  });
}

export function getBenchPlayers(
  sideNumber: 1 | 2,
  sideRoster: Record<string, 1 | 2>,
  gender?: string,
): PlayerTimeEntry[] {
  return Object.values(players).filter((p) => {
    if (sideRoster[p.participantId] !== sideNumber) return false;
    if (p.isOnCourt) return false;
    return !(gender && p.gender && p.gender !== gender);
  });
}

export function handleSubstitution(outParticipantId: string, inParticipantId: string) {
  stopTracking(outParticipantId);
  startTracking(inParticipantId);
}

export function resetPlayerTimes() {
  for (const entry of Object.values(players)) {
    entry.clock.stop();
  }
  players = {};
  version = 0;
}
