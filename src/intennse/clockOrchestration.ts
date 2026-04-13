/**
 * INTENNSE clock orchestration rules.
 *
 * Pure functions that determine clock behavior in response to game events.
 * These functions return clock *commands* — the caller (Svelte component or
 * test harness) is responsible for executing them against the clock API.
 */

// ── Clock configuration ─────────────────────────────────────

let BOLT_DURATION_MS = 10 * 60 * 1000; // 10 minutes, configurable

export function setBoltDuration(ms: number) { BOLT_DURATION_MS = ms; }
export { BOLT_DURATION_MS };

export const SERVE_CLOCK_DURATION_MS = 14 * 1000; // 14 seconds
export const TIMEOUT_DURATION_MS = 60 * 1000; // 60 seconds

export const BOLT_TICK_MS = 200;
export const SERVE_TICK_MS = 100;
export const TIMEOUT_TICK_MS = 200;

export const BOLT_URGENT_MS = 60_000;
export const BOLT_CRITICAL_MS = 30_000;
export const SERVE_URGENT_MS = 5_000;
export const SERVE_CRITICAL_MS = 3_000;

// ── Clock command types ─────────────────────────────────────

export type ClockCommand =
  | { type: 'restart'; clockId: string }
  | { type: 'pause'; clockId: string }
  | { type: 'resume'; clockId: string }
  | { type: 'destroy'; clockId: string }
  | { type: 'create'; clockId: string; durationMs: number; tickIntervalMs: number; autoStart: boolean };

// ── Event handlers ──────────────────────────────────────────

/**
 * Commands to execute when the bolt is started for the first time.
 */
export function onBoltStart(): ClockCommand[] {
  return [
    { type: 'restart', clockId: 'boltTimer' },
    { type: 'restart', clockId: 'serveClock' },
  ];
}

/**
 * Commands to execute when the umpire marks rally start (PLAY button).
 */
export function onRallyStart(): ClockCommand[] {
  return [
    { type: 'pause', clockId: 'serveClock' },
  ];
}

/**
 * Commands to execute after each point is recorded.
 */
export function onPointComplete(): ClockCommand[] {
  return [
    { type: 'restart', clockId: 'serveClock' },
  ];
}

/**
 * Commands to execute when a timeout is called.
 *
 * @param serveClockRunning - whether the serve clock was running at the time
 */
export function onTimeoutStart(serveClockRunning: boolean): ClockCommand[] {
  const commands: ClockCommand[] = [
    { type: 'pause', clockId: 'boltTimer' },
  ];
  if (serveClockRunning) {
    commands.push({ type: 'pause', clockId: 'serveClock' });
  }
  commands.push({
    type: 'create',
    clockId: 'timeoutTimer',
    durationMs: TIMEOUT_DURATION_MS,
    tickIntervalMs: TIMEOUT_TICK_MS,
    autoStart: true,
  });
  return commands;
}

/**
 * Commands to execute when a timeout ends (naturally or dismissed early).
 *
 * @param serveClockWasRunning - whether the serve clock was running before the timeout
 */
export function onTimeoutEnd(serveClockWasRunning: boolean): ClockCommand[] {
  const commands: ClockCommand[] = [
    { type: 'destroy', clockId: 'timeoutTimer' },
    { type: 'resume', clockId: 'boltTimer' },
  ];
  if (serveClockWasRunning) {
    commands.push({ type: 'restart', clockId: 'serveClock' });
  }
  return commands;
}
