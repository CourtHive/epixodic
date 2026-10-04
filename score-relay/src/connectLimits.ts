/**
 * Per-key fixed-window connect-rate limit for /tracker.
 *
 * Closes the "connect handshake itself is unlimited" gap flagged in
 * the 2026-05-31 design-flaws punch list (LOW). The default (60/min)
 * is intentionally generous so legitimate reconnect storms during
 * deploys don't trip it; abuse looks like hundreds of attempts per
 * minute.
 *
 * Keyed on client IP. Behind a reverse proxy this rolls up to the
 * proxy's egress IP — that's by design: the cap acts as
 * defense-in-depth on total handshake traffic rather than a per-end-user
 * gate. Individual end-users are handled by the per-user token bucket
 * in `TrackerLimits` once their JWT lands.
 */

const PRUNE_AFTER_MS = 5 * 60 * 1000;
const WINDOW_MS = 60_000;

export interface ConnectLimitConfig {
  /** Allowed connects per rolling 60-second window per key. Default 60. */
  maxConnectsPerMinute: number;
  /** Override for tests (defaults to Date.now). */
  now?: () => number;
}

interface Window {
  count: number;
  windowStartMs: number;
}

export class ConnectLimits {
  private readonly windows = new Map<string, Window>();
  private readonly maxConnects: number;
  private readonly now: () => number;

  constructor(config: ConnectLimitConfig) {
    this.maxConnects = Math.max(1, config.maxConnectsPerMinute);
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Returns true if the connect attempt is admitted. Fixed-window
   * (not sliding) for simplicity — the window resets exactly 60s
   * after its first attempt, so a burst at second 59 then 0 sees
   * 2× capacity in a 2-second window. Acceptable for a defense-in-depth
   * cap.
   */
  tryConnect(key: string): boolean {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.windowStartMs >= WINDOW_MS) {
      window = { count: 1, windowStartMs: now };
      this.windows.set(key, window);
      return true;
    }
    if (window.count >= this.maxConnects) return false;
    window.count++;
    return true;
  }

  /** Drop windows that haven't been touched in PRUNE_AFTER_MS. */
  prune(): void {
    const cutoff = this.now() - PRUNE_AFTER_MS;
    for (const [key, window] of this.windows) {
      if (window.windowStartMs < cutoff) this.windows.delete(key);
    }
  }

  size(): number {
    return this.windows.size;
  }
}
