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
 *
 * Scoped to the **ARC** (parent team matchUp), not to individual tieMatchUps.
 * A penalty served in the final seconds of Men's Singles carries into Men's
 * Doubles; `setArcContext()` resets the box only when a different ARC is
 * entered. Within an ARC, the penalty clock only ticks when a bolt clock is
 * running for which the penalised player is eligible (not gender-blocked) —
 * see `isEligibleForBolt` + `resumePenaltyClocksForBolt`.
 */

/** Bolt gender context used for eligibility gating. */
export type BoltGender = 'MALE' | 'FEMALE' | 'MIXED';
export interface BoltContext {
  matchUpType?: string;
  gender?: BoltGender;
}

interface BoxEntry {
  participantId: string;
  participantName: string;
  jerseyNumber?: string;
  sideNumber: 1 | 2;
  /** Player's gender — used to pause the clock during ineligible bolts. */
  gender?: BoltGender;
  clockId: string;
}

let entries = $state<BoxEntry[]>([]);
let currentArcId = $state<string | undefined>(undefined);
let version = $state(0);

function bump() { version++; }

function clockIdFor(participantId: string) {
  return `penaltyBox-${participantId}`;
}

export function getPenaltyBoxState() {
  return {
    get entries() { return entries; },
    get arcId() { return currentArcId; },
    get version() { return version; },
  };
}

/**
 * Declare which ARC (parent team matchUp) the penalty box currently belongs
 * to. Called from `BoltScoringPage.onMount`.
 *
 *   undefined → X  : adopt the id, preserve existing entries (first mount).
 *   X         → X  : no-op (mounting another tieMatchUp inside the same ARC).
 *   X         → Y  : clear every pending penalty (new team match begins).
 *   X         → undefined : clear (ARC context is being torn down).
 */
export function setArcContext(arcId: string | undefined) {
  if (arcId === currentArcId) return;
  const leavingArc = currentArcId !== undefined;
  if (leavingArc) {
    for (const e of entries) destroyClock(e.clockId);
    entries = [];
  }
  currentArcId = arcId;
  bump();
}

/**
 * Returns true when the penalised player is eligible for the given bolt
 * (matches the bolt's gender, or the bolt is MIXED). Unknown gender on
 * either side defaults to eligible — the rulebook's gender rule only
 * applies when both are known.
 */
export function isEligibleForBolt(
  playerGender: BoltGender | undefined,
  bolt: BoltContext | undefined,
): boolean {
  if (!bolt) return true;
  if (bolt.gender === 'MIXED') return true;
  if (!bolt.gender || !playerGender) return true;
  return playerGender === bolt.gender;
}

export function sendToBox(
  participantId: string,
  participantName: string,
  sideNumber: 1 | 2,
  durationMs = 120_000,
  onRelease?: (participantId: string) => void,
  jerseyNumber?: string,
  gender?: BoltGender,
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

  entries = [
    ...entries,
    { participantId, participantName, jerseyNumber, sideNumber, gender, clockId },
  ];
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
  gender?: BoltGender;
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
        gender: e.gender,
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
 *
 * Prefer `resumePenaltyClocksForBolt(bolt)` in component code so that a
 * penalised male player's clock does not tick during a women's bolt.
 */
export function resumeAllPenaltyClocks() {
  for (const e of entries) {
    const snap = getClockSnapshot(e.clockId);
    if (snap?.state === 'paused') resumeClock(e.clockId);
  }
  bump();
}

/**
 * Resume only those penalty clocks whose players are eligible for the
 * given bolt (by gender). Ineligible players stay paused, so a male
 * serving a penalty sits idle through WS/WD bolts and resumes his time
 * when the next MS/MD/XD bolt starts.
 */
export function resumePenaltyClocksForBolt(bolt: BoltContext | undefined) {
  for (const e of entries) {
    const snap = getClockSnapshot(e.clockId);
    if (snap?.state !== 'paused') continue;
    if (isEligibleForBolt(e.gender, bolt)) resumeClock(e.clockId);
  }
  bump();
}

export function resetPenaltyBox() {
  for (const e of entries) {
    destroyClock(e.clockId);
  }
  entries = [];
  currentArcId = undefined;
  version = 0;
}
