/**
 * Pure predicates that decide whether control-bar buttons are disabled on
 * the INTENNSE bolt scoring page. Kept outside the Svelte components so
 * they can be unit tested without a DOM. Each layout (Vertical /
 * Horizontal) passes in the inputs it actually tracks.
 */

export interface TimeoutDisableInput {
  /** True while the between-bolts break clock is running. */
  breakActive: boolean;
  /** Remaining timeouts for this side (never negative in practice). */
  timeoutsRemaining: number;
  /**
   * Whether the bolt has started. The Vertical layout historically does
   * not gate Timeout on boltStarted, so this is optional; pass false only
   * when the layout needs the pre-bolt lockout (e.g., Horizontal footer).
   */
  requireBoltStarted?: boolean;
  /** Whether the bolt is currently started. Only read when `requireBoltStarted` is true. */
  boltStarted?: boolean;
}

/**
 * A Timeout button is disabled when:
 *   1. The layout requires a started bolt and the bolt has not started yet, OR
 *   2. A break is currently active — timeouts can only be called during live play, OR
 *   3. The side has no remaining timeouts.
 */
export function isTimeoutButtonDisabled(input: TimeoutDisableInput): boolean {
  if (input.requireBoltStarted && !input.boltStarted) return true;
  if (input.breakActive) return true;
  if (input.timeoutsRemaining <= 0) return true;
  return false;
}
