/**
 * INTENNSE clock editing rules.
 *
 * Pure functions for validating and clamping clock edit values.
 * Clocks can be edited by tapping — the clock pauses and the user
 * adjusts the value. Max values are enforced per clock.
 */

import { BOLT_DURATION_MS, SERVE_CLOCK_DURATION_MS } from './clockOrchestration';

export interface ClockEditLimits {
  maxMs: number;
  minMs: number;
  stepMs: number;
}

const CLOCK_LIMITS: Record<string, ClockEditLimits> = {
  boltTimer: { maxMs: BOLT_DURATION_MS, minMs: 0, stepMs: 1000 },
  serveClock: { maxMs: SERVE_CLOCK_DURATION_MS, minMs: 0, stepMs: 1000 },
};

/**
 * Get the edit limits for a named clock.
 * Returns undefined if the clock is not editable.
 */
export function getClockEditLimits(clockId: string): ClockEditLimits | undefined {
  return CLOCK_LIMITS[clockId];
}

/**
 * Clamp a time value to the allowed range for a clock.
 */
export function clampClockValue(clockId: string, ms: number): number {
  const limits = CLOCK_LIMITS[clockId];
  if (!limits) return ms;
  return Math.max(limits.minMs, Math.min(limits.maxMs, ms));
}

/**
 * Increment or decrement the clock value by one step, clamped to limits.
 */
export function stepClockValue(clockId: string, currentMs: number, direction: 'up' | 'down'): number {
  const limits = CLOCK_LIMITS[clockId];
  if (!limits) return currentMs;
  const delta = direction === 'up' ? limits.stepMs : -limits.stepMs;
  return clampClockValue(clockId, currentMs + delta);
}

/**
 * Parse a user-entered time string (e.g. "5:30", ":14", "30") into milliseconds.
 * Returns null if unparseable.
 */
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim().replace(/^:/, '');
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const secs = parseInt(parts[0], 10);
    return isNaN(secs) ? null : secs * 1000;
  }
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return null;
    return (mins * 60 + secs) * 1000;
  }
  return null;
}
