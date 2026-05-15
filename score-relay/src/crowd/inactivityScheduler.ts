/**
 * Inactivity scheduler — Phase 3 slice 5.
 *
 * Periodically scans the `crowd` schema for active sessions whose
 * `updated_at` is older than the configured threshold (default 2 hours)
 * and transitions them to `cancelled-by-inactivity`. Per Decision 6 in
 * Mentat/planning/COURTHIVE_PUBLIC_INTERACTIVE_TRACKING.md.
 *
 * Implemented as a small `start(storage, options)` returning a `stop()`
 * disposer. The real interval is created via `setInterval`; tests inject
 * a fake `setTimer` to drive iterations deterministically.
 */

import type { CrowdScoringStorage } from './storage.js';

export interface InactivitySchedulerOptions {
  /** How often the sweep runs, in milliseconds. Default 30 minutes. */
  intervalMs?: number;
  /** Sessions idle longer than this are cancelled. Default 2 hours. */
  thresholdMs?: number;
  /** Logger sink. Default `console.log`. */
  logger?: (message: string) => void;
  /** Injected for tests — defaults to global `setInterval`. */
  setTimer?: (handler: () => void, delay: number) => NodeJS.Timeout;
  /** Injected for tests — defaults to global `clearInterval`. */
  clearTimer?: (handle: NodeJS.Timeout) => void;
  /** Injected for tests — defaults to `() => new Date()`. */
  now?: () => Date;
}

export interface InactivityScheduler {
  /** Disposer — call to stop the periodic sweep. Safe to call multiple times. */
  stop: () => void;
  /** Run one sweep immediately. Returns how many sessions were cancelled. */
  runOnce: () => Promise<number>;
}

const THIRTY_MINUTES = 30 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;

export function startInactivityScheduler(
  storage: CrowdScoringStorage,
  options: InactivitySchedulerOptions = {},
): InactivityScheduler {
  const intervalMs = options.intervalMs ?? THIRTY_MINUTES;
  const thresholdMs = options.thresholdMs ?? TWO_HOURS;
  const log = options.logger ?? ((m: string) => console.log(`[crowd-inactivity] ${m}`));
  const setTimer = options.setTimer ?? setInterval;
  const clearTimer = options.clearTimer ?? clearInterval;
  const now = options.now ?? (() => new Date());

  async function runOnce(): Promise<number> {
    const cutoff = new Date(now().getTime() - thresholdMs);
    try {
      const cancelled = await storage.cancelStaleSince(cutoff);
      if (cancelled > 0) log(`cancelled ${cancelled} stale session(s) (cutoff ${cutoff.toISOString()})`);
      return cancelled;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`sweep failed: ${message}`);
      return 0;
    }
  }

  const handle = setTimer(() => {
    void runOnce();
  }, intervalMs);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimer(handle);
    },
    runOnce,
  };
}
