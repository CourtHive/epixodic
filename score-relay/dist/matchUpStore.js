/** In-memory store of active match state keyed by matchUpId */
const activeMatches = new Map();
export function updateMatch(update) {
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
export function setMatchHistory(history) {
    const existing = activeMatches.get(history.matchUpId);
    if (existing) {
        existing.history = history;
        existing.updatedAt = Date.now();
    }
    else {
        activeMatches.set(history.matchUpId, {
            matchUpId: history.matchUpId,
            tournamentId: history.tournamentId,
            lastUpdate: { matchUpId: history.matchUpId, score: {} },
            history,
            updatedAt: Date.now(),
        });
    }
}
export function getMatch(matchUpId) {
    return activeMatches.get(matchUpId);
}
export function getActiveMatchIds() {
    return Array.from(activeMatches.keys());
}
export function getMatchUpsByTournament(tournamentId) {
    const results = [];
    for (const state of activeMatches.values()) {
        if (state.tournamentId === tournamentId) {
            results.push(state.lastUpdate);
        }
    }
    return results;
}
export function removeMatch(matchUpId) {
    clearClockTimer(matchUpId);
    activeMatches.delete(matchUpId);
}
// ── Clock anchor + tick timer ───────────────────────────────
export function setClockAnchor(matchUpId, anchor) {
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
export function getClockAnchor(matchUpId) {
    return activeMatches.get(matchUpId)?.clockAnchor;
}
export function setClockTimer(matchUpId, timer) {
    const state = activeMatches.get(matchUpId);
    if (state)
        state.clockTimer = timer;
}
export function clearClockTimer(matchUpId) {
    const state = activeMatches.get(matchUpId);
    if (state?.clockTimer) {
        clearInterval(state.clockTimer);
        state.clockTimer = undefined;
    }
}
/** Remove matches that haven't been updated in the given duration (ms) */
export function pruneStaleMatches(maxAgeMs) {
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
