import type { MatchHistory } from './types.js';
export declare function configurePersistence(url?: string): void;
/**
 * Push match history to competition-factory-server for persistence.
 * Retries up to 3 times with exponential backoff.
 * This is a fire-and-forget operation — failures are logged but do not
 * block the relay from broadcasting.
 */
export declare function persistMatchHistory(history: MatchHistory): Promise<void>;
