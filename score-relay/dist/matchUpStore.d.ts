import type { ScoreUpdate, MatchHistory } from './types.js';
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
    /** Whether the serve clock is actively counting down.
     *  False during a rally (serve clock paused, bolt still running). */
    serveClockRunning: boolean;
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
export declare function updateMatch(update: ScoreUpdate): void;
export declare function setMatchHistory(history: MatchHistory): void;
export declare function getMatch(matchUpId: string): MatchState | undefined;
export declare function getActiveMatchIds(): string[];
export declare function getMatchUpsByTournament(tournamentId: string): ScoreUpdate[];
export declare function removeMatch(matchUpId: string): void;
export declare function setClockAnchor(matchUpId: string, anchor: ClockAnchor): void;
export declare function getClockAnchor(matchUpId: string): ClockAnchor | undefined;
export declare function setClockTimer(matchUpId: string, timer: ReturnType<typeof setInterval>): void;
export declare function clearClockTimer(matchUpId: string): void;
/** Remove matches that haven't been updated in the given duration (ms) */
export declare function pruneStaleMatches(maxAgeMs: number): number;
export {};
