import { describe, expect, it } from 'vitest';
import { ConnectLimits } from './connectLimits.js';

describe('ConnectLimits', () => {
  it('admits up to maxConnectsPerMinute attempts from one key', () => {
    let now = 1_000_000;
    const limits = new ConnectLimits({ maxConnectsPerMinute: 3, now: () => now });
    expect(limits.tryConnect('1.2.3.4')).toBe(true);
    expect(limits.tryConnect('1.2.3.4')).toBe(true);
    expect(limits.tryConnect('1.2.3.4')).toBe(true);
    expect(limits.tryConnect('1.2.3.4')).toBe(false);
  });

  it('isolates buckets per key', () => {
    let now = 1_000_000;
    const limits = new ConnectLimits({ maxConnectsPerMinute: 2, now: () => now });
    limits.tryConnect('a');
    limits.tryConnect('a');
    expect(limits.tryConnect('a')).toBe(false);
    expect(limits.tryConnect('b')).toBe(true); // independent bucket
  });

  it('opens a fresh window after WINDOW_MS', () => {
    let now = 1_000_000;
    const limits = new ConnectLimits({ maxConnectsPerMinute: 2, now: () => now });
    limits.tryConnect('a');
    limits.tryConnect('a');
    expect(limits.tryConnect('a')).toBe(false);

    now += 60_001; // 60s + 1ms — past the window boundary
    expect(limits.tryConnect('a')).toBe(true);
    expect(limits.tryConnect('a')).toBe(true);
    expect(limits.tryConnect('a')).toBe(false);
  });

  it('prunes windows that have not been touched in 5 minutes', () => {
    let now = 1_000_000;
    const limits = new ConnectLimits({ maxConnectsPerMinute: 3, now: () => now });
    limits.tryConnect('old');
    limits.tryConnect('new');
    now += 5 * 60 * 1000 + 1;
    limits.tryConnect('new'); // refreshes its window
    limits.prune();
    expect(limits.size()).toBe(1);
  });

  it('treats maxConnectsPerMinute <= 0 as a minimum of 1', () => {
    let now = 1_000_000;
    const limits = new ConnectLimits({ maxConnectsPerMinute: 0, now: () => now });
    expect(limits.tryConnect('x')).toBe(true);
    expect(limits.tryConnect('x')).toBe(false);
  });
});
