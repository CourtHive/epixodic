import { createClock, destroyClock, getClockSnapshot } from '../../clock';

/**
 * Manages penalty box state. When a player is penalized they are removed
 * from court for a configurable duration (default 2 minutes). While in
 * the box the player cannot be substituted back in. When the timer expires
 * the player is "freed" and becomes available on the bench.
 */

interface BoxEntry {
  participantId: string;
  participantName: string;
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

  entries = [...entries, { participantId, participantName, sideNumber, clockId }];
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
        sideNumber: e.sideNumber,
        remainingMs: snapshot?.remainingMs ?? 0,
      };
    });
}

export function resetPenaltyBox() {
  for (const e of entries) {
    destroyClock(e.clockId);
  }
  entries = [];
  version = 0;
}
