import { describe, expect, it } from 'vitest';
import { UserLimits } from './userLimits.js';

describe('UserLimits — concurrent sessions', () => {
  it('allows up to maxConcurrentSessions sessions per user', () => {
    const limits = new UserLimits({ maxConcurrentSessions: 3 });
    expect(limits.acquireSession('u1', 's1')).toBe(true);
    expect(limits.acquireSession('u1', 's2')).toBe(true);
    expect(limits.acquireSession('u1', 's3')).toBe(true);
    expect(limits.acquireSession('u1', 's4')).toBe(false);
  });

  it('counts sessions per user independently', () => {
    const limits = new UserLimits({ maxConcurrentSessions: 2 });
    expect(limits.acquireSession('u1', 's1')).toBe(true);
    expect(limits.acquireSession('u1', 's2')).toBe(true);
    expect(limits.acquireSession('u1', 's3')).toBe(false);
    expect(limits.acquireSession('u2', 's1')).toBe(true);
  });

  it('releaseSession frees a slot', () => {
    const limits = new UserLimits({ maxConcurrentSessions: 1 });
    limits.acquireSession('u1', 's1');
    expect(limits.acquireSession('u1', 's2')).toBe(false);
    limits.releaseSession('u1', 's1');
    expect(limits.acquireSession('u1', 's2')).toBe(true);
  });

  it('re-acquiring the same sessionId is a no-op', () => {
    const limits = new UserLimits({ maxConcurrentSessions: 1 });
    expect(limits.acquireSession('u1', 's1')).toBe(true);
    expect(limits.acquireSession('u1', 's1')).toBe(true);
    expect(limits.activeSessionCount('u1')).toBe(1);
  });
});

describe('UserLimits — token bucket rate limit', () => {
  it('allows up to eventsPerSecond events immediately, then drops further events', () => {
    let now = 1_000_000;
    const limits = new UserLimits({ eventsPerSecond: 3, now: () => now });

    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);

    const denied = limits.tryConsumeEvent('u1');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(now);
  });

  it('refills steadily over time', () => {
    let now = 1_000_000;
    const limits = new UserLimits({ eventsPerSecond: 5, now: () => now });

    for (let i = 0; i < 5; i++) limits.tryConsumeEvent('u1');
    expect(limits.tryConsumeEvent('u1').allowed).toBe(false);

    now += 1_000; // 1 second later
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
  });

  it('caps refill at eventsPerSecond', () => {
    let now = 1_000_000;
    const limits = new UserLimits({ eventsPerSecond: 5, now: () => now });

    limits.tryConsumeEvent('u1'); // bucket at 4

    now += 600_000; // 10 minutes — way more than enough to overflow
    const snap = limits.snapshot('u1');
    expect(snap?.tokens).toBe(5);
  });

  it('isolates buckets per user', () => {
    let now = 1_000_000;
    const limits = new UserLimits({ eventsPerSecond: 1, now: () => now });
    expect(limits.tryConsumeEvent('u1').allowed).toBe(true);
    expect(limits.tryConsumeEvent('u1').allowed).toBe(false);
    expect(limits.tryConsumeEvent('u2').allowed).toBe(true);
  });
});
