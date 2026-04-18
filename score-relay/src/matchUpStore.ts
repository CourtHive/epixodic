import type { ScoreUpdate, MatchHistory } from './types.js';

/** In-memory store of active match state keyed by matchUpId */
const activeMatches = new Map<string, MatchState>();

/** Anchor for relay-native clock tick generation. Set on every
 *  `intennse` event; the relay derives sub-second ticks by
 *  extrapolating from the anchor using wall-clock elapsed time. */
export interface ClockAnchor {
  boltRemainingMs: number;
  serveRemainingMs: number;
  /** Date.now() when the anchor was captured from the intennse event. */
  anchoredAt: number;
  /** True when ANY clock should be ticking (bolt, timeout, or break). */
  running: boolean;
  /** Which countdown is active: bolt (normal play), timeout (team
   *  timeout), break (between bolts), or none (paused/complete). */
  activeClock: 'bolt' | 'timeout' | 'break' | 'none';
  /** Remaining ms on the active secondary clock (timeout or break).
   *  Only set when activeClock is 'timeout' or 'break'. */
  activeClockRemainingMs?: number;
  /** Stored so the ticker can fan out to the tournament room. */
  tournamentId?: string;
}

interface MatchState {
  matchUpId: string;
  tournamentId?: string;
  lastUpdate: ScoreUpdate;
  history?: MatchHistory;
  updatedAt: number;
  clockAnchor?: ClockAnchor;
  clockTimer?: ReturnType<typeof setInterval>;
}

export function updateMatch(update: ScoreUpdate): void {
  const existing = activeMatches.get(update.matchUpId);
  activeMatches.set(update.matchUpId, {
    matchUpId: update.matchUpId,
    tournamentId: update.tournamentId ?? existing?.tournamentId,
    lastUpdate: update,
    history: existing?.history,
    updatedAt: Date.now(),
    clockAnchor: existing?.clockAnchor,
    clockTimer: existing?.clockTimer,
  });
}

export function setMatchHistory(history: MatchHistory): void {
  const existing = activeMatches.get(history.matchUpId);
  if (existing) {
    existing.history = history;
    existing.updatedAt = Date.now();
  } else {
    activeMatches.set(history.matchUpId, {
      matchUpId: history.matchUpId,
      tournamentId: history.tournamentId,
      lastUpdate: { matchUpId: history.matchUpId, score: {} },
      history,
      updatedAt: Date.now(),
    });
  }
}

export function getMatch(matchUpId: string): MatchState | undefined {
  return activeMatches.get(matchUpId);
}

export function getActiveMatchIds(): string[] {
  return Array.from(activeMatches.keys());
}

export function getMatchUpsByTournament(tournamentId: string): ScoreUpdate[] {
  const results: ScoreUpdate[] = [];
  for (const state of activeMatches.values()) {
    if (state.tournamentId === tournamentId) {
      results.push(state.lastUpdate);
    }
  }
  return results;
}

export function removeMatch(matchUpId: string): void {
  clearClockTimer(matchUpId);
  activeMatches.delete(matchUpId);
}

// ── Clock anchor + tick timer ───────────────────────────────

export function setClockAnchor(matchUpId: string, anchor: ClockAnchor): void {
  let state = activeMatches.get(matchUpId);
  if (!state) {
    // The intennse handler doesn't call updateMatch (it fans out
    // without storing), so the match entry may not exist yet. Create
    // a minimal one so the anchor persists.
    state = {
      matchUpId,
      tournamentId: anchor.tournamentId,
      lastUpdate: { matchUpId, score: {} },
      updatedAt: Date.now(),
    };
    activeMatches.set(matchUpId, state);
  }
  state.clockAnchor = anchor;
  state.updatedAt = Date.now();
}

export function getClockAnchor(matchUpId: string): ClockAnchor | undefined {
  return activeMatches.get(matchUpId)?.clockAnchor;
}

export function setClockTimer(matchUpId: string, timer: ReturnType<typeof setInterval>): void {
  const state = activeMatches.get(matchUpId);
  if (state) state.clockTimer = timer;
}

export function clearClockTimer(matchUpId: string): void {
  const state = activeMatches.get(matchUpId);
  if (state?.clockTimer) {
    clearInterval(state.clockTimer);
    state.clockTimer = undefined;
  }
}

/** Remove matches that haven't been updated in the given duration (ms) */
export function pruneStaleMatches(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;
  for (const [id, state] of activeMatches) {
    if (state.updatedAt < cutoff) {
      clearClockTimer(id);
      activeMatches.delete(id);
      pruned++;
    }
  }
  return pruned;
}
