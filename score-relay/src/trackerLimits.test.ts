import { describe, expect, it } from 'vitest';
import { TrackerLimits } from './trackerLimits.js';

describe('TrackerLimits', () => {
  it('allows up to capacity in an instantaneous burst', () => {
    let now = 1_000_000;
    const limits = new TrackerLimits({ eventsPerSecond: 5, now: () => now });
    for (let i = 0; i < 5; i++) {
      expect(limits.tryConsume('m-1').allowed).toBe(true);
    }
    const overflow = limits.tryConsume('m-1');
    expect(overflow.allowed).toBe(false);
    expect(overflow.retryAfter).toBeGreaterThan(0);
  });

  it('refills proportionally to elapsed wall-clock time', () => {
    let now = 1_000_000;
    const limits = new TrackerLimits({ eventsPerSecond: 10, now: () => now });
    for (let i = 0; i < 10; i++) limits.tryConsume('m-1');
    expect(limits.tryConsume('m-1').allowed).toBe(false);

    now += 500;
    expect(limits.tryConsume('m-1').allowed).toBe(true); // ~5 tokens refilled
    expect(limits.tryConsume('m-1').allowed).toBe(true);
    expect(limits.tryConsume('m-1').allowed).toBe(true);
  });

  it('keeps buckets independent per matchUp', () => {
    let now = 1_000_000;
    const limits = new TrackerLimits({ eventsPerSecond: 2, now: () => now });
    expect(limits.tryConsume('m-a').allowed).toBe(true);
    expect(limits.tryConsume('m-a').allowed).toBe(true);
    expect(limits.tryConsume('m-a').allowed).toBe(false);
    expect(limits.tryConsume('m-b').allowed).toBe(true);
    expect(limits.tryConsume('m-b').allowed).toBe(true);
  });

  it('prunes idle buckets after the cutoff', () => {
    let now = 1_000_000;
    const limits = new TrackerLimits({ eventsPerSecond: 5, now: () => now });
    limits.tryConsume('m-old');
    limits.tryConsume('m-new');
    now += 5 * 60 * 1000 + 1; // 5 minutes 1 ms
    limits.tryConsume('m-new'); // touches m-new
    limits.prune();
    expect(limits.size()).toBe(1); // m-old pruned, m-new survives
  });

  it('treats eventsPerSecond <= 0 as a minimum of 1', () => {
    let now = 1_000_000;
    const limits = new TrackerLimits({ eventsPerSecond: 0, now: () => now });
    expect(limits.tryConsume('m').allowed).toBe(true);
    expect(limits.tryConsume('m').allowed).toBe(false);
  });

  // LOW 2 (2026-05-31 punch list): per-user fan-out ceiling closes the
  // bypass where one userId across N matchUps gets N × per-match cap.
  describe('per-user fan-out ceiling', () => {
    it('caps a user across all matchUps at eventsPerSecond * userFanoutMultiplier', () => {
      let now = 1_000_000;
      // 2 ev/s/match × 3 user multiplier → 6 ev/s/user total.
      const limits = new TrackerLimits({ eventsPerSecond: 2, userFanoutMultiplier: 3, now: () => now });
      // Spread the calls across 6 distinct matchUps — without the user
      // ceiling, each would allow 2 events for a total of 12. With the
      // ceiling, only the first 6 land; the 7th is user-rejected.
      for (let i = 0; i < 6; i++) {
        expect(limits.tryConsume(`m-${i}`, 'u-1').allowed).toBe(true);
      }
      const result = limits.tryConsume('m-6', 'u-1');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('user');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('keeps per-matchUp limits independent of the user bucket', () => {
      let now = 1_000_000;
      // High user multiplier so we hit per-matchUp first.
      const limits = new TrackerLimits({ eventsPerSecond: 2, userFanoutMultiplier: 100, now: () => now });
      expect(limits.tryConsume('m-1', 'u-1').allowed).toBe(true);
      expect(limits.tryConsume('m-1', 'u-1').allowed).toBe(true);
      const result = limits.tryConsume('m-1', 'u-1');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('matchUp');
    });

    it('isolates user buckets — one user being throttled does not affect another', () => {
      let now = 1_000_000;
      const limits = new TrackerLimits({ eventsPerSecond: 2, userFanoutMultiplier: 1, now: () => now });
      // u-1 burns their 2-event budget
      expect(limits.tryConsume('m-1', 'u-1').allowed).toBe(true);
      expect(limits.tryConsume('m-2', 'u-1').allowed).toBe(true);
      expect(limits.tryConsume('m-3', 'u-1').allowed).toBe(false);
      // u-2 still has full budget
      expect(limits.tryConsume('m-1', 'u-2').allowed).toBe(true);
      expect(limits.tryConsume('m-2', 'u-2').allowed).toBe(true);
    });

    it('falls back to per-matchUp-only behavior when no userId is provided', () => {
      let now = 1_000_000;
      const limits = new TrackerLimits({ eventsPerSecond: 2, userFanoutMultiplier: 1, now: () => now });
      // userId omitted on every call — user bucket never engaged.
      expect(limits.tryConsume('m-1').allowed).toBe(true);
      expect(limits.tryConsume('m-2').allowed).toBe(true);
      expect(limits.tryConsume('m-3').allowed).toBe(true);
      expect(limits.tryConsume('m-4').allowed).toBe(true);
    });

    it('prunes user buckets the same way as matchUp buckets', () => {
      let now = 1_000_000;
      const limits = new TrackerLimits({ eventsPerSecond: 2, userFanoutMultiplier: 2, now: () => now });
      limits.tryConsume('m-1', 'u-old');
      limits.tryConsume('m-2', 'u-new');
      now += 5 * 60 * 1000 + 1;
      limits.tryConsume('m-2', 'u-new');
      limits.prune();
      expect(limits.userSize()).toBe(1);
    });
  });
});
