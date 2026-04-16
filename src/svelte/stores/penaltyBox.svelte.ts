import {
  createClock,
  destroyClock,
  getClockSnapshot,
  pauseClock,
  resumeClock,
  setClockRemaining,
} from '../../clock';

/**
 * Penalty-box state, projected from the scoring engine's `history.points`
 * stream.
 *
 * Penalties are scoring events (they award points to the opposing side),
 * so they live in `history.points` alongside every other scored point.
 * Each `PENALTY_INCURRED` point carries enough metadata for the box to be
 * fully derived:
 *
 *   penaltyEvent: true
 *   penaltyAgainstParticipantId: string
 *   penaltyDurationMs: number
 *   penaltyGender?: 'MALE' | 'FEMALE' | 'MIXED'
 *   penaltyServedMs?: number     (decorated over time as the clock ticks)
 *   penaltyReleasedAt?: string   (decorated when the player is freed)
 *   timestamp: string            (already present on every Point)
 *
 * This store holds only the live Clock instances for currently-displayed
 * countdowns; the authoritative "is player X in the box with Y remaining"
 * answer is always a projection of history. `hydrateFromTeamMatchUp()`
 * rebuilds the in-memory projection after navigating to a new tieMatchUp
 * or applying a server document; subsequent pause/resume/release events
 * flush `penaltyServedMs` / `penaltyReleasedAt` back to history via the
 * injected `persistCallback`.
 */

// ── Public types ────────────────────────────────────────────

export type BoltGender = 'MALE' | 'FEMALE' | 'MIXED';

export interface BoltContext {
  matchUpType?: string;
  gender?: BoltGender;
}

/**
 * Metadata captured on a PENALTY_INCURRED point. Populated at
 * `executePenalty` time; decorated later with servedMs / releasedAt.
 */
export interface PenaltyPoint {
  penaltyEvent: boolean;
  penaltyAgainstParticipantId: string;
  penaltyDurationMs: number;
  penaltyGender?: BoltGender;
  penaltyServedMs?: number;
  penaltyReleasedAt?: string;
  // Standard point fields we read through:
  timestamp?: string;
  // Arbitrary other fields are ignored by the projection.
  [key: string]: any;
}

/** A projected, currently-open penalty. */
export interface BoxEntry {
  participantId: string;
  participantName: string;
  jerseyNumber?: string;
  sideNumber: 1 | 2;
  gender?: BoltGender;
  /** tieMatchUpId where the PENALTY_INCURRED lives. */
  sourceTieMatchUpId: string;
  /** Index in that tieMatchUp's `history.points`. */
  sourcePointIndex: number;
  /** Original penalty duration (const for the life of the entry). */
  durationMs: number;
  /** Accumulated served time at the last flush — grows as Clock ticks. */
  servedMs: number;
  incurredAt?: string;
  clockId: string;
}

/**
 * Writes `metadata` onto the PENALTY_INCURRED point at
 * `(tieMatchUpId, pointIndex)`. For the currently-loaded tieMatchUp the
 * caller will typically delegate to `engine.decoratePoint(...)`; for a
 * prior tieMatchUp in the same ARC the caller mutates
 * `teamMatchUp.tieMatchUps[i].engineState.history.points[j]` directly
 * and triggers a push. Supplied by the owning component on mount.
 */
export type PersistCallback = (
  tieMatchUpId: string,
  pointIndex: number,
  metadata: Partial<PenaltyPoint>,
) => void;

// ── Module-level state ──────────────────────────────────────

let entries = $state<BoxEntry[]>([]);
let version = $state(0);
let persistCallback: PersistCallback | null = null;

function bump() { version++; }

function clockIdFor(participantId: string) {
  return `penaltyBox-${participantId}`;
}

// ── Reads ───────────────────────────────────────────────────

export function getPenaltyBoxState() {
  return {
    get entries() { return entries; },
    get version() { return version; },
  };
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
        remainingMs: snapshot?.remainingMs ?? Math.max(0, e.durationMs - e.servedMs),
      };
    });
}

// ── Gender eligibility ──────────────────────────────────────

export function isEligibleForBolt(
  playerGender: BoltGender | undefined,
  bolt: BoltContext | undefined,
): boolean {
  if (!bolt) return true;
  if (bolt.gender === 'MIXED') return true;
  if (!bolt.gender || !playerGender) return true;
  return playerGender === bolt.gender;
}

// ── Persistence wiring ──────────────────────────────────────

export function setPersistCallback(cb: PersistCallback | null) {
  persistCallback = cb;
}

function persist(entry: BoxEntry, metadata: Partial<PenaltyPoint>) {
  if (!persistCallback) return;
  persistCallback(entry.sourceTieMatchUpId, entry.sourcePointIndex, metadata);
}

// ── Lifecycle: add, release ─────────────────────────────────

/**
 * Register a freshly-created PENALTY_INCURRED point in the live box.
 * Typically called from `executePenalty` right after `addPoint` returns
 * the new point's index. The clock is created seeded at `durationMs`
 * and starts running when the bolt clock is running (caller's
 * responsibility — pass `autoStart` or call `resumePenaltyClocksForBolt`).
 */
export function sendToBox(
  participantId: string,
  participantName: string,
  sideNumber: 1 | 2,
  options: {
    durationMs?: number;
    jerseyNumber?: string;
    gender?: BoltGender;
    sourceTieMatchUpId: string;
    sourcePointIndex: number;
    incurredAt?: string;
    onRelease?: (participantId: string) => void;
    autoStart?: boolean;
  },
) {
  if (entries.some((e) => e.participantId === participantId)) return;

  const durationMs = options.durationMs ?? 120_000;
  const clockId = clockIdFor(participantId);

  createClock({
    id: clockId,
    durationMs,
    direction: 'down',
    autoStart: options.autoStart ?? false,
    tickIntervalMs: 1000,
    onTick: () => bump(),
    onExpire: () => {
      // Clock reached zero naturally — mark released, persist, evict.
      const entry = entries.find((e) => e.participantId === participantId);
      if (entry) {
        entry.servedMs = entry.durationMs;
        persist(entry, { penaltyServedMs: entry.durationMs, penaltyReleasedAt: new Date().toISOString() });
      }
      releaseFromBox(participantId);
      options.onRelease?.(participantId);
    },
  });

  const entry: BoxEntry = {
    participantId,
    participantName,
    jerseyNumber: options.jerseyNumber,
    sideNumber,
    gender: options.gender,
    sourceTieMatchUpId: options.sourceTieMatchUpId,
    sourcePointIndex: options.sourcePointIndex,
    durationMs,
    servedMs: 0,
    incurredAt: options.incurredAt,
    clockId,
  };
  entries = [...entries, entry];
  bump();
}

export function releaseFromBox(participantId: string) {
  const entry = entries.find((e) => e.participantId === participantId);
  if (!entry) return;
  destroyClock(entry.clockId);
  entries = entries.filter((e) => e.participantId !== participantId);
  bump();
}

// ── Lifecycle: pause / resume with servedMs flush ──────────

/**
 * Snapshot the currently-elapsed served time on every running penalty
 * clock back into history, then pause the clock. Called at every point
 * where the bolt clock stops (break start, timeout start, officialPause,
 * unmount). Safe when the box is empty.
 */
export function pauseAllPenaltyClocks() {
  for (const entry of entries) {
    const snap = getClockSnapshot(entry.clockId);
    if (snap?.state !== 'running') continue;
    pauseClock(entry.clockId);
    // Elapsed from the Clock is TOTAL served time since this run started.
    // We want CUMULATIVE servedMs on the entry.
    const cumulative = entry.durationMs - (snap.remainingMs ?? entry.durationMs);
    if (cumulative > entry.servedMs) {
      entry.servedMs = cumulative;
      persist(entry, { penaltyServedMs: cumulative });
    }
  }
  bump();
}

/**
 * Resume every paused penalty clock. Prefer `resumePenaltyClocksForBolt`
 * in component code so a penalised male's clock does not tick during
 * women's bolts.
 */
export function resumeAllPenaltyClocks() {
  for (const entry of entries) {
    const snap = getClockSnapshot(entry.clockId);
    if (snap?.state === 'paused') resumeClock(entry.clockId);
  }
  bump();
}

/**
 * Resume only clocks whose player is eligible for the given bolt (by
 * gender). Ineligible players stay paused so a male's penalty sits idle
 * through WS/WD and picks up on the next MS/MD/XD bolt.
 */
export function resumePenaltyClocksForBolt(bolt: BoltContext | undefined) {
  for (const entry of entries) {
    const snap = getClockSnapshot(entry.clockId);
    if (snap?.state !== 'paused') continue;
    if (isEligibleForBolt(entry.gender, bolt)) resumeClock(entry.clockId);
  }
  bump();
}

// ── Projection from history ─────────────────────────────────

/**
 * Walk every tieMatchUp in the given team matchUp, find each open
 * (non-released, non-fully-served) PENALTY_INCURRED point, and rebuild
 * the in-memory box from scratch. Clocks are seeded to the remaining
 * time (durationMs − servedMs) in the paused state — the caller is
 * responsible for calling `resumePenaltyClocksForBolt(currentBolt)`
 * when play actually begins.
 *
 * Idempotent: calling twice with the same input lands in the same state.
 */
export function hydrateFromTeamMatchUp(teamMatchUp: any | null | undefined) {
  // Tear down anything currently live — clocks will be re-created below.
  for (const entry of entries) destroyClock(entry.clockId);
  entries = [];

  const tieMatchUps: any[] = Array.isArray(teamMatchUp?.tieMatchUps) ? teamMatchUp.tieMatchUps : [];

  // For each participant, find the LATEST non-released incurred point.
  // (In practice there's at most one open penalty per participant at a
  // time — the rulebook doesn't stack them — but being tolerant of a
  // future "second incident" rule change costs nothing here.)
  const latestOpen = new Map<string, { tieMatchUpId: string; pointIndex: number; point: PenaltyPoint }>();

  for (const tie of tieMatchUps) {
    const points: any[] = tie?.engineState?.history?.points ?? [];
    const tieMatchUpId: string = tie?.matchUpId ?? '';
    if (!tieMatchUpId) continue;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p?.penaltyEvent) continue;
      const pid = p.penaltyAgainstParticipantId;
      if (!pid) continue;
      if (p.penaltyReleasedAt) {
        // This participant's most recent release supersedes any earlier open.
        latestOpen.delete(pid);
        continue;
      }
      const served = p.penaltyServedMs ?? 0;
      const duration = p.penaltyDurationMs ?? 120_000;
      if (served >= duration) {
        // Fully served even without an explicit release marker.
        latestOpen.delete(pid);
        continue;
      }
      latestOpen.set(pid, { tieMatchUpId, pointIndex: i, point: p });
    }
  }

  // Rebuild entries + clocks.
  const nextEntries: BoxEntry[] = [];
  for (const [pid, { tieMatchUpId, pointIndex, point }] of latestOpen) {
    const durationMs = point.penaltyDurationMs ?? 120_000;
    const servedMs = point.penaltyServedMs ?? 0;
    const remainingMs = Math.max(0, durationMs - servedMs);
    const clockId = clockIdFor(pid);

    createClock({
      id: clockId,
      durationMs,
      direction: 'down',
      autoStart: false,
      tickIntervalMs: 1000,
      onTick: () => bump(),
      onExpire: () => {
        const entry = entries.find((e) => e.participantId === pid);
        if (entry) {
          entry.servedMs = entry.durationMs;
          persist(entry, { penaltyServedMs: entry.durationMs, penaltyReleasedAt: new Date().toISOString() });
        }
        releaseFromBox(pid);
      },
    });
    // Clock starts idle with elapsed=0. setClockRemaining seeds it to the
    // already-served value (elapsedMs = durationMs − remainingMs = servedMs).
    setClockRemaining(clockId, remainingMs);

    nextEntries.push({
      participantId: pid,
      participantName: point.penaltyAgainstParticipantName ?? pid,
      jerseyNumber: point.penaltyAgainstJerseyNumber,
      sideNumber: (point.penaltyAgainstSideNumber as 1 | 2) ?? 1,
      gender: point.penaltyGender,
      sourceTieMatchUpId: tieMatchUpId,
      sourcePointIndex: pointIndex,
      durationMs,
      servedMs,
      incurredAt: point.timestamp,
      clockId,
    });
  }
  entries = nextEntries;
  bump();
}

// ── Full reset (tests + dev tools) ──────────────────────────

export function resetPenaltyBox() {
  for (const e of entries) destroyClock(e.clockId);
  entries = [];
  version = 0;
  persistCallback = null;
}
