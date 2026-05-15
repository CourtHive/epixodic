/**
 * Per-user limits — Phase 3 slice 2.
 *
 * Tracks two things in-memory:
 *   1. Token-bucket rate limit per user — default 5 events/sec, refill steady.
 *   2. Concurrent active session set per user — default cap 3 (Decision 6).
 *
 * In-memory state is acceptable here: score-relay is a single process and
 * crowd writes are strictly best-effort unofficial data. A restart wipes
 * the buckets, the cap re-derives from the next connections, and Postgres
 * holds the persistent session state regardless.
 */

export interface UserLimitsOptions {
  /** Token-bucket capacity in events. Default 5. */
  eventsPerSecond?: number;
  /** Max concurrent active sessions per user. Default 3. */
  maxConcurrentSessions?: number;
  /** Injected clock — defaults to `Date.now()`. */
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** When the next event would be allowed, ms since epoch. */
  retryAfter?: number;
}

interface UserState {
  /** Bucket fill, in fractional tokens. */
  tokens: number;
  /** Last refill timestamp (ms). */
  lastRefillMs: number;
  /** Currently-open session ids for this user. */
  sessions: Set<string>;
}

export class UserLimits {
  private readonly eventsPerSecond: number;
  private readonly maxConcurrentSessions: number;
  private readonly now: () => number;
  private readonly users: Map<string, UserState> = new Map();

  constructor(options: UserLimitsOptions = {}) {
    this.eventsPerSecond = options.eventsPerSecond ?? 5;
    this.maxConcurrentSessions = options.maxConcurrentSessions ?? 3;
    this.now = options.now ?? Date.now;
  }

  /**
   * Try to acquire a session slot. Returns false when the user is at the cap.
   * The caller is expected to call `releaseSession` on disconnect.
   */
  acquireSession(userId: string, sessionId: string): boolean {
    const state = this.ensureUser(userId);
    if (state.sessions.has(sessionId)) return true; // re-acquire is a no-op
    if (state.sessions.size >= this.maxConcurrentSessions) return false;
    state.sessions.add(sessionId);
    return true;
  }

  releaseSession(userId: string, sessionId: string): void {
    const state = this.users.get(userId);
    if (!state) return;
    state.sessions.delete(sessionId);
    if (state.sessions.size === 0 && state.tokens >= this.eventsPerSecond) {
      // Bucket full and no sessions — reclaim the map entry to keep memory bounded.
      this.users.delete(userId);
    }
  }

  activeSessionCount(userId: string): number {
    return this.users.get(userId)?.sessions.size ?? 0;
  }

  /**
   * Consume one event from the user's bucket. Returns allowed=false when
   * the bucket is empty; in that case the caller should drop the event.
   */
  tryConsumeEvent(userId: string): RateLimitDecision {
    const state = this.ensureUser(userId);
    this.refill(state);

    if (state.tokens < 1) {
      const deficit = 1 - state.tokens;
      const retryAfter = this.now() + (deficit / this.eventsPerSecond) * 1000;
      return { allowed: false, retryAfter };
    }

    state.tokens -= 1;
    return { allowed: true };
  }

  /** Test/debug accessor. */
  snapshot(userId: string): { tokens: number; sessionCount: number } | undefined {
    const state = this.users.get(userId);
    if (!state) return undefined;
    this.refill(state);
    return { tokens: state.tokens, sessionCount: state.sessions.size };
  }

  private ensureUser(userId: string): UserState {
    const existing = this.users.get(userId);
    if (existing) return existing;
    const fresh: UserState = {
      tokens: this.eventsPerSecond,
      lastRefillMs: this.now(),
      sessions: new Set(),
    };
    this.users.set(userId, fresh);
    return fresh;
  }

  private refill(state: UserState): void {
    const nowMs = this.now();
    const elapsedSec = (nowMs - state.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    state.tokens = Math.min(this.eventsPerSecond, state.tokens + elapsedSec * this.eventsPerSecond);
    state.lastRefillMs = nowMs;
  }
}
