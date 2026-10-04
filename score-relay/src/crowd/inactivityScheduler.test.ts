import { describe, expect, it, vi } from 'vitest';
import { startInactivityScheduler } from './inactivityScheduler.js';
import type { CrowdScoringStorage } from './storage.js';

function fakeStorage(impl: { cancelStaleSince: (cutoff: Date) => Promise<number> }): CrowdScoringStorage {
  return impl as unknown as CrowdScoringStorage;
}

describe('startInactivityScheduler', () => {
  it('passes a cutoff `thresholdMs` before now() to cancelStaleSince', async () => {
    const cancelStaleSince = vi.fn().mockResolvedValue(0);
    const fixedNow = new Date('2026-05-15T12:00:00Z');

    const scheduler = startInactivityScheduler(fakeStorage({ cancelStaleSince }), {
      thresholdMs: 60 * 60 * 1000, // 1 hour
      now: () => fixedNow,
      setTimer: () => 0 as unknown as NodeJS.Timeout,
      clearTimer: () => undefined,
    });

    await scheduler.runOnce();

    expect(cancelStaleSince).toHaveBeenCalledOnce();
    const cutoff: Date = cancelStaleSince.mock.calls[0][0];
    expect(cutoff.toISOString()).toBe('2026-05-15T11:00:00.000Z');
    scheduler.stop();
  });

  it('schedules periodic sweeps via the injected setTimer', () => {
    const cancelStaleSince = vi.fn().mockResolvedValue(0);
    const setTimer = vi.fn().mockReturnValue(42 as unknown as NodeJS.Timeout);
    const clearTimer = vi.fn();

    const scheduler = startInactivityScheduler(fakeStorage({ cancelStaleSince }), {
      intervalMs: 5000,
      setTimer,
      clearTimer,
    });

    expect(setTimer).toHaveBeenCalledOnce();
    expect(setTimer.mock.calls[0][1]).toBe(5000);

    scheduler.stop();
    expect(clearTimer).toHaveBeenCalledWith(42);
  });

  it('stop() is idempotent', () => {
    const clearTimer = vi.fn();
    const scheduler = startInactivityScheduler(fakeStorage({ cancelStaleSince: async () => 0 }), {
      setTimer: () => 0 as unknown as NodeJS.Timeout,
      clearTimer,
    });
    scheduler.stop();
    scheduler.stop();
    scheduler.stop();
    expect(clearTimer).toHaveBeenCalledOnce();
  });

  it('logs when sessions are cancelled and swallows storage errors', async () => {
    const messages: string[] = [];
    const scheduler = startInactivityScheduler(
      fakeStorage({ cancelStaleSince: vi.fn().mockResolvedValue(3) }),
      {
        logger: (m: string) => messages.push(m),
        setTimer: () => 0 as unknown as NodeJS.Timeout,
        clearTimer: () => undefined,
      },
    );

    await scheduler.runOnce();
    expect(messages.some((m) => m.includes('cancelled 3 stale'))).toBe(true);

    const failing = startInactivityScheduler(
      fakeStorage({ cancelStaleSince: vi.fn().mockRejectedValue(new Error('connection lost')) }),
      {
        logger: (m: string) => messages.push(m),
        setTimer: () => 0 as unknown as NodeJS.Timeout,
        clearTimer: () => undefined,
      },
    );
    const result = await failing.runOnce();
    expect(result).toBe(0);
    expect(messages.some((m) => m.includes('sweep failed: connection lost'))).toBe(true);
  });
});
