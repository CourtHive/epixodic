import type { ScoreUpdate, MatchHistory } from './types.js';

/** In-memory store of active match state keyed by matchUpId */
const activeMatches = new Map<string, MatchState>();

interface MatchState {
  matchUpId: string;
  tournamentId?: string;
  lastUpdate: ScoreUpdate;
  history?: MatchHistory;
  updatedAt: number;
}

export function updateMatch(update: ScoreUpdate): void {
  const existing = activeMatches.get(update.matchUpId);
  activeMatches.set(update.matchUpId, {
    matchUpId: update.matchUpId,
    tournamentId: update.tournamentId ?? existing?.tournamentId,
    lastUpdate: update,
    history: existing?.history,
    updatedAt: Date.now(),
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
  activeMatches.delete(matchUpId);
}

/** Remove matches that haven't been updated in the given duration (ms) */
export function pruneStaleMatches(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;
  for (const [id, state] of activeMatches) {
    if (state.updatedAt < cutoff) {
      activeMatches.delete(id);
      pruned++;
    }
  }
  return pruned;
}
