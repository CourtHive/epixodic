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
});
