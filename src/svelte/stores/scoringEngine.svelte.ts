import { scoreGovernor } from 'tods-competition-factory';

const { ScoringEngine } = scoreGovernor;

/**
 * Reactive Svelte store wrapping the factory ScoringEngine.
 * Components read from $derived state and call methods that
 * delegate to the engine then bump a version counter to
 * trigger reactivity.
 */

let engine: any = null;
let version = $state(0);

// Derived state — re-evaluated when version changes
const score = $derived.by(() => {
  void version;
  return engine?.getScore() ?? { sets: [], scoreString: '' };
});
const pointCount = $derived.by(() => {
  void version;
  return engine?.getPointCount() ?? 0;
});
const isComplete = $derived.by(() => {
  void version;
  return engine?.isComplete() ?? false;
});
const activePlayers = $derived.by(() => {
  void version;
  return engine?.getActivePlayers() ?? { side1: [], side2: [] };
});
const server = $derived.by(() => {
  void version;
  return engine?.getNextServer() ?? 0;
});
const canUndo = $derived.by(() => {
  void version;
  return engine?.canUndo() ?? false;
});
const canRedo = $derived.by(() => {
  void version;
  return engine?.canRedo() ?? false;
});
const sets = $derived.by(() => {
  void version;
  return engine?.getState()?.score?.sets ?? [];
});
const boltScores = $derived.by(() => {
  void version;
  const allSets = engine?.getState()?.score?.sets ?? [];
  return allSets.map((s: any, i: number) => ({
    boltIndex: i,
    side1: s.side1Score ?? 0,
    side2: s.side2Score ?? 0,
    winningSide: s.winningSide,
  }));
});
const aggregateScore = $derived.by(() => {
  void version;
  const allSets = engine?.getState()?.score?.sets ?? [];
  return allSets.reduce(
    (acc: { side1: number; side2: number }, s: any) => ({
      side1: acc.side1 + (s.side1Score ?? 0),
      side2: acc.side2 + (s.side2Score ?? 0),
    }),
    { side1: 0, side2: 0 },
  );
});

function bump() {
  version++;
}

// ── Public API ──

export function getScoringState() {
  return {
    get score() { return score; },
    get pointCount() { return pointCount; },
    get isComplete() { return isComplete; },
    get activePlayers() { return activePlayers; },
    get server() { return server; },
    get canUndo() { return canUndo; },
    get canRedo() { return canRedo; },
    get sets() { return sets; },
    get boltScores() { return boltScores; },
    get aggregateScore() { return aggregateScore; },
    get version() { return version; },
  };
}

export function initScoringEngine(config: {
  matchUpFormat: string;
  competitionFormat?: any;
  isDoubles?: boolean;
  eventHandlers?: any;
}) {
  engine = new ScoringEngine({
    matchUpFormat: config.matchUpFormat,
    competitionFormat: config.competitionFormat,
    isDoubles: config.isDoubles,
    eventHandlers: {
      onPoint: (ctx: any) => {
        bump();
        config.eventHandlers?.onPoint?.(ctx);
      },
      onUndo: (ctx: any) => {
        bump();
        config.eventHandlers?.onUndo?.(ctx);
      },
      onRedo: (ctx: any) => {
        bump();
        config.eventHandlers?.onRedo?.(ctx);
      },
      onReset: (ctx: any) => {
        bump();
        config.eventHandlers?.onReset?.(ctx);
      },
      onGameComplete: (ctx: any) => {
        bump();
        config.eventHandlers?.onGameComplete?.(ctx);
      },
      onSetComplete: (ctx: any) => {
        bump();
        config.eventHandlers?.onSetComplete?.(ctx);
      },
      onMatchComplete: (ctx: any) => {
        bump();
        config.eventHandlers?.onMatchComplete?.(ctx);
      },
    },
  });
  bump();
  return engine;
}

export function addPoint(
  winner: 0 | 1,
  options?: { result?: string; server?: 0 | 1; [key: string]: any },
): number | undefined {
  if (!engine) return undefined;
  engine.addPoint({ winner, ...options });
  bump();
  // Index of the point we just appended, so callers (e.g. the penalty box)
  // can decorate it with lifecycle metadata (servedMs, releasedAt, ...).
  const points = engine.getState()?.history?.points;
  return points ? points.length - 1 : undefined;
}

export function undo(): boolean {
  if (!engine) return false;
  const success = engine.undo();
  if (success) bump();
  return success;
}

export function redo(): boolean {
  if (!engine) return false;
  const success = engine.redo();
  if (success) bump();
  return success;
}

export function endSegment(options?: { reason?: string }) {
  if (!engine) return;
  engine.endSegment(options);
  bump();
}

export function substitute(sideNumber: 1 | 2, outParticipantId: string, inParticipantId: string) {
  if (!engine) return;
  engine.substitute({ sideNumber, outParticipantId, inParticipantId });
  bump();
}

export function recordChallengeEntry(sideNumber: 1 | 2) {
  if (!engine) return;
  const state = engine.getState();
  if (state?.history?.entries) {
    state.history.entries.push({
      type: 'challenge',
      data: { sideNumber },
      timestamp: new Date().toISOString(),
    });
    bump();
  }
}

export function removeChallengeEntry(entryIndex: number) {
  if (!engine) return;
  const state = engine.getState();
  if (state?.history?.entries && state.history.entries[entryIndex]?.type === 'challenge') {
    state.history.entries.splice(entryIndex, 1);
    bump();
  }
}

export function setLineUp(sideNumber: 1 | 2, lineUp: any[]) {
  if (!engine) return;
  engine.setLineUp(sideNumber, lineUp);
  bump();
}

export function setServer(side: 0 | 1, options?: { recordEntry?: boolean }) {
  if (!engine) return;
  engine.setServer(side, options);
  bump();
}

export function decoratePoint(pointIndex: number, metadata: Record<string, any>) {
  if (!engine) return;
  engine.decoratePoint(pointIndex, metadata);
  bump();
}

/**
 * Overwrite attributes on a specific past point and recalculate
 * downstream state. Used by the point-history detail modal (Phase 3)
 * for non-LIFO edits.
 */
export function editPoint(
  pointIndex: number,
  newData: Record<string, any>,
  options?: { recalculate?: boolean },
) {
  if (!engine) return;
  engine.editPoint(pointIndex, newData, options);
  bump();
}

/**
 * Remove a specific past point and recalculate downstream state.
 * Used by the point-history detail modal (Phase 3) for non-LIFO
 * corrections where the user wants the record gone entirely (e.g.
 * a mis-entered penalty or an accidentally-logged point).
 */
export function removePoint(pointIndex: number, options?: { recalculate?: boolean }) {
  if (!engine) return;
  engine.removePoint(pointIndex, options);
  bump();
}

/**
 * Snapshot each point's currently-stored `server` field into its matching
 * `history.entries` entry so that a subsequent `editPoint(recalculate:
 * true)` rebuild honours the actual-observed serve order rather than
 * re-deriving servers from the new winner chain.
 *
 * Used by the point-history detail modal (Phase 3) when the scorekeeper
 * flips a winner as a **post-review correction**: play continued
 * based on the original (incorrect) call, so subsequent points keep
 * the servers they were actually played with. For ordinary
 * scorekeeping-error corrections — where the on-court winner was right
 * but got mis-recorded — this function is not called, and the rebuild
 * re-derives servers naturally.
 *
 * Safe to call before any rebuild; no-op when there is no engine.
 */
export function pinEntryServersToPoints() {
  if (!engine) return;
  const state = engine.getState();
  const points: any[] = state?.history?.points ?? [];
  const entries: any[] = state?.history?.entries ?? [];
  for (const entry of entries) {
    if (entry?.type !== 'point') continue;
    const idx = entry.pointIndex;
    if (typeof idx !== 'number') continue;
    const point = points[idx];
    if (point && typeof point.server === 'number') {
      entry.data = entry.data ?? {};
      entry.data.server = point.server;
    }
  }
  bump();
}

export function getEngineState(): any {
  return engine?.getState();
}

export function setEngineState(state: any) {
  if (!engine) return;
  engine.setState(state);
  bump();
}

export function getSupplementaryState(): any {
  return engine?.getSupplementaryState();
}

export function loadSupplementaryState(state: any) {
  if (!engine) return;
  engine.loadSupplementaryState(state);
  bump();
}

export function getEngine(): any {
  return engine;
}

export function getTimerProfile(): any {
  return engine?.getTimerProfile();
}

export function getTimeoutRules(): any {
  return engine?.getTimeoutRules();
}

export function getSubstitutionRules(): any {
  return engine?.getSubstitutionRules();
}

export function getPlayerRules(): any {
  return engine?.getPlayerRules();
}

export function getPenaltyBoxProfile(): any {
  return engine?.getPenaltyBoxProfile();
}

export function getCompetitionFormat(): any {
  return engine?.competitionFormat;
}

export function resetScoringEngine() {
  if (!engine) return;
  engine.reset();
  bump();
}

export function destroyScoringEngine() {
  engine = null;
  version = 0;
}
