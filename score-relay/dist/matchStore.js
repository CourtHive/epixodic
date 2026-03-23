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
export function removeMatch(matchUpId) {
    activeMatches.delete(matchUpId);
}
/** Remove matches that haven't been updated in the given duration (ms) */
export function pruneStaleMatches(maxAgeMs) {
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
