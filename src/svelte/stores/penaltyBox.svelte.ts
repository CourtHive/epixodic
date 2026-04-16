import {
  createClock,
  destroyClock,
  getClockSnapshot,
  pauseClock,
  resumeClock,
} from '../../clock';

/**
 * Manages penalty box state. When a player is penalized they are removed
 * from court for a configurable duration (default 2 minutes). While in
 * the box the player cannot be substituted back in. When the timer expires
 * the player is "freed" and becomes available on the bench.
 */

interface BoxEntry {
  participantId: string;
  participantName: string;
  jerseyNumber?: string;
  sideNumber: 1 | 2;
  clockId: string;
}

let entries = $state<BoxEntry[]>([]);
let version = $state(0);

function bump() { version++; }

function clockIdFor(participantId: string) {
  return `penaltyBox-${participantId}`;
}

export function getPenaltyBoxState() {
  return {
    get entries() { return entries; },
    get version() { return version; },
  };
}

export function sendToBox(
  participantId: string,
  participantName: string,
  sideNumber: 1 | 2,
  durationMs = 120_000,
  onRelease?: (participantId: string) => void,
  jerseyNumber?: string,
) {
  // Already in box
  if (entries.some((e) => e.participantId === participantId)) return;

  const clockId = clockIdFor(participantId);

  createClock({
    id: clockId,
    durationMs,
    direction: 'down',
    autoStart: true,
    tickIntervalMs: 1000,
    onTick: () => bump(),
    onExpire: () => {
      releaseFromBox(participantId);
      onRelease?.(participantId);
    },
  });

  entries = [...entries, { participantId, participantName, jerseyNumber, sideNumber, clockId }];
  bump();
}

export function releaseFromBox(participantId: string) {
  const clockId = clockIdFor(participantId);
  destroyClock(clockId);
  entries = entries.filter((e) => e.participantId !== participantId);
  bump();
}

export function isInBox(participantId: string): boolean {
  return entries.some((e) => e.participantId === participantId);
}

export function getBoxedPlayers(sideNumber?: 1 | 2): {
  participantId: string;
  participantName: string;
  jerseyNumber?: string;
  sideNumber: 1 | 2;
  remainingMs: number;
}[] {
  return entries
    .filter((e) => sideNumber === undefined || e.sideNumber === sideNumber)
    .map((e) => {
      const snapshot = getClockSnapshot(e.clockId);
      return {
        participantId: e.participantId,
        participantName: e.participantName,
        jerseyNumber: e.jerseyNumber,
        sideNumber: e.sideNumber,
        remainingMs: snapshot?.remainingMs ?? 0,
      };
    });
}

/**
 * Pause every active penalty-box clock. Used when a bolt ends and the
 * between-bolts break begins — a penalised player's remaining time must not
 * tick down while play is halted. Safe to call when there are no entries.
 */
export function pauseAllPenaltyClocks() {
  for (const e of entries) {
    const snap = getClockSnapshot(e.clockId);
    if (snap?.state === 'running') pauseClock(e.clockId);
  }
  bump();
}

/**
 * Resume every paused penalty-box clock. Paired with `pauseAllPenaltyClocks`
 * and called when the next bolt actually begins. Entries whose clocks were
 * never paused (or have already expired) are left untouched.
 */
export function resumeAllPenaltyClocks() {
  for (const e of entries) {
    const snap = getClockSnapshot(e.clockId);
    if (snap?.state === 'paused') resumeClock(e.clockId);
  }
  bump();
}

export function resetPenaltyBox() {
  for (const e of entries) {
    destroyClock(e.clockId);
  }
  entries = [];
  version = 0;
}
