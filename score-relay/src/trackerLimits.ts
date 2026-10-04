/**
 * Token-bucket rate limit for /tracker — IONSport Open Issue #3.
 *
 * Two buckets per attempt:
 *  - per-matchUp (default capacity = `eventsPerSecond`)
 *  - per-userId  (default capacity = `eventsPerSecond * userFanoutMultiplier`)
 *
 * The per-user bucket closes the LOW-severity bypass where a token
 * holder could spam N matchUpIds and effectively earn N × rate-limit
 * (each matchUp bucket being independent). With the per-user ceiling
 * in place, total throughput is bounded by the user bucket regardless
 * of fan-out. The bucket is keyed on the JWT `userId` claim
 * (`provisioner:<uuid>` or a bare user uuid) — see TrackerSocketData.
 *
 * Buckets are pruned 5 minutes after last access so an idle relay
 * doesn't accumulate unbounded state.
 */

const PRUNE_AFTER_MS = 5 * 60 * 1000;

export interface TrackerLimitConfig {
  /** Steady-state cap per matchUp. Default 10. */
  eventsPerSecond: number;
  /**
   * Per-user ceiling expressed as a multiplier of `eventsPerSecond`.
   * Default 5 → at the default 10 ev/s per match, a user is capped at
   * 50 ev/s across all matchUps they own. Lets legitimate IONSport-style
   * fan-out across a handful of live courts work normally; abusive
   * fan-out is throttled.
   */
  userFanoutMultiplier?: number;
  /** Override for tests (defaults to Date.now). */
  now?: () => number;
}

export interface ConsumeResult {
  allowed: boolean;
  retryAfter?: number;
  /** Which bucket caused a rejection — useful for ops + tests. */
  scope?: 'matchUp' | 'user';
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TrackerLimits {
  private readonly matchUpBuckets = new Map<string, Bucket>();
  private readonly userBuckets = new Map<string, Bucket>();
  private readonly matchUpCapacity: number;
  private readonly matchUpRefillPerMs: number;
  private readonly userCapacity: number;
  private readonly userRefillPerMs: number;
  private readonly now: () => number;

  constructor(config: TrackerLimitConfig) {
    this.matchUpCapacity = Math.max(1, config.eventsPerSecond);
    this.matchUpRefillPerMs = this.matchUpCapacity / 1000;
    const multiplier = Math.max(1, config.userFanoutMultiplier ?? 5);
    this.userCapacity = this.matchUpCapacity * multiplier;
    this.userRefillPerMs = this.userCapacity / 1000;
    this.now = config.now ?? (() => Date.now());
  }

  /**
   * Consume one event for the given matchUp (and userId if known).
   * The per-user bucket is checked first so legitimate token holders
   * see a 'user' scope on rejection instead of a confusing per-matchUp
   * 'rate-limited' that they could mistakenly retry against by
   * switching matchUps.
   */
  tryConsume(matchUpId: string, userId?: string): ConsumeResult {
    const now = this.now();
    if (userId) {
      const userResult = this.consumeBucket(
        this.userBuckets,
        userId,
        this.userCapacity,
        this.userRefillPerMs,
        now,
      );
      if (!userResult.allowed) return { ...userResult, scope: 'user' };
    }
    const matchResult = this.consumeBucket(
      this.matchUpBuckets,
      matchUpId,
      this.matchUpCapacity,
      this.matchUpRefillPerMs,
      now,
    );
    if (!matchResult.allowed) return { ...matchResult, scope: 'matchUp' };
    return { allowed: true };
  }

  private consumeBucket(
    buckets: Map<string, Bucket>,
    key: string,
    capacity: number,
    refillPerMs: number,
    now: number,
  ): ConsumeResult {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(key, bucket);
    }
    const elapsedMs = now - bucket.lastRefill;
    if (elapsedMs > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedMs * refillPerMs);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }
    const deficit = 1 - bucket.tokens;
    return { allowed: false, retryAfter: deficit / refillPerMs / 1000 };
  }

  /** Drop buckets that haven't been touched in PRUNE_AFTER_MS. */
  prune(): void {
    const cutoff = this.now() - PRUNE_AFTER_MS;
    for (const [key, bucket] of this.matchUpBuckets) {
      if (bucket.lastRefill < cutoff) this.matchUpBuckets.delete(key);
    }
    for (const [key, bucket] of this.userBuckets) {
      if (bucket.lastRefill < cutoff) this.userBuckets.delete(key);
    }
  }

  /** Expose size for tests / metrics. */
  size(): number {
    return this.matchUpBuckets.size;
  }

  /** Expose per-user bucket size for tests / metrics. */
  userSize(): number {
    return this.userBuckets.size;
  }
}
