/**
 * Per-matchUp token-bucket rate limit for /tracker — IONSport Open Issue #3.
 *
 * One bucket per matchUpId. Default capacity = `eventsPerSecond` so a
 * burst at the start of a point is OK; the refill rate caps long-run
 * throughput. When a bucket goes empty the caller gets `allowed: false`
 * + a `retryAfter` hint in seconds, mirroring `UserLimits` semantics
 * on /crowd.
 *
 * Buckets are pruned 5 minutes after last access so an idle relay
 * doesn't accumulate unbounded state.
 */

const PRUNE_AFTER_MS = 5 * 60 * 1000;

export interface TrackerLimitConfig {
  /** Steady-state cap per matchUp. Default 10. */
  eventsPerSecond: number;
  /** Override for tests (defaults to Date.now). */
  now?: () => number;
}

export interface ConsumeResult {
  allowed: boolean;
  retryAfter?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TrackerLimits {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(config: TrackerLimitConfig) {
    this.capacity = Math.max(1, config.eventsPerSecond);
    this.refillPerMs = this.capacity / 1000;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Consume one event for the given matchUp. Refills the bucket
   * proportionally to elapsed wall-clock time since last refill.
   */
  tryConsume(matchUpId: string): ConsumeResult {
    const now = this.now();
    let bucket = this.buckets.get(matchUpId);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(matchUpId, bucket);
    }

    const elapsedMs = now - bucket.lastRefill;
    if (elapsedMs > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedMs * this.refillPerMs);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    const deficit = 1 - bucket.tokens;
    const retryAfter = deficit / this.refillPerMs / 1000; // seconds
    return { allowed: false, retryAfter };
  }

  /** Drop buckets that haven't been touched in PRUNE_AFTER_MS. */
  prune(): void {
    const cutoff = this.now() - PRUNE_AFTER_MS;
    for (const [matchUpId, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) this.buckets.delete(matchUpId);
    }
  }

  /** Expose size for tests / metrics. */
  size(): number {
    return this.buckets.size;
  }
}
