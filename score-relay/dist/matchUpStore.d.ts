import type { ScoreUpdate, MatchHistory } from './types.js';
interface MatchState {
    matchUpId: string;
    tournamentId?: string;
    lastUpdate: ScoreUpdate;
    history?: MatchHistory;
    updatedAt: number;
}
export declare function updateMatch(update: ScoreUpdate): void;
export declare function setMatchHistory(history: MatchHistory): void;
export declare function getMatch(matchUpId: string): MatchState | undefined;
export declare function getActiveMatchIds(): string[];
export declare function getMatchUpsByTournament(tournamentId: string): ScoreUpdate[];
export declare function removeMatch(matchUpId: string): void;
/** Remove matches that haven't been updated in the given duration (ms) */
export declare function pruneStaleMatches(maxAgeMs: number): number;
export {};
