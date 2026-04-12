/**
 * Payload shapes pushed to score-relay by competition-factory-server's
 * ProjectorService. These mirror the canonical types in
 * competition-factory-server/src/modules/projectors/types/.
 *
 * Kept narrow on purpose: score-relay only forwards these payloads, it
 * doesn't introspect them.
 *
 * The scorebug intake accepts both ScorebugPayload (event-driven) and
 * ScorebugClockTick (sub-second cadence). They are discriminated by
 * the required `kind` field — `'event'` vs `'tick'`.
 */

export interface ScorebugPayload {
  kind: 'event';
  matchUpId: string;
  tournamentId: string;
  format: string;
  side1: unknown;
  side2: unknown;
  bolt: {
    number: number;
    label?: string;
    boltClockMs: number;
    serveClockMs: number;
    state: string;
  };
  matchUpStatus: string;
  generatedAt: string;
}

export interface ScorebugClockTick {
  kind: 'tick';
  matchUpId: string;
  tournamentId: string;
  format: string;
  state: 'play';
  boltClockMs: number;
  serveClockMs: number;
  playerClocks?: Record<string, { remainingMs: number; isOnCourt: boolean }>;
  generatedAt: string;
}

/** Either an event payload or a tick payload — discriminated by `kind`. */
export type ScorebugInputPayload = ScorebugPayload | ScorebugClockTick;

export function isScorebugTick(payload: ScorebugInputPayload): payload is ScorebugClockTick {
  return (payload as ScorebugClockTick).kind === 'tick';
}

export interface VideoBoardPayload {
  matchUpId: string;
  bolt: {
    number: number;
    state: string;
    boltClock: { remainingMs: number; anchorTimestamp: string; running: boolean };
    serveClock: { remainingMs: number; anchorTimestamp: string; running: boolean };
  };
  scoreboard: unknown;
  sequence: number;
  generatedAt: string;
}
