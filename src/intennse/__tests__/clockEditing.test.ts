import { describe, it, expect } from 'vitest';
import {
  getClockEditLimits,
  clampClockValue,
  stepClockValue,
  parseTimeInput,
} from '../clockEditing';
import { BOLT_DURATION_MS, SERVE_CLOCK_DURATION_MS } from '../clockOrchestration';

describe('getClockEditLimits', () => {
  it('returns limits for boltTimer', () => {
    const limits = getClockEditLimits('boltTimer');
    expect(limits).toBeDefined();
    expect(limits!.maxMs).toBe(BOLT_DURATION_MS);
  });

  it('returns limits for serveClock', () => {
    const limits = getClockEditLimits('serveClock');
    expect(limits).toBeDefined();
    expect(limits!.maxMs).toBe(SERVE_CLOCK_DURATION_MS);
  });

  it('returns undefined for unknown clock', () => {
    expect(getClockEditLimits('timeoutTimer')).toBeUndefined();
  });
});

describe('clampClockValue', () => {
  it('clamps bolt timer to max 10 minutes', () => {
    expect(clampClockValue('boltTimer', 999_999)).toBe(BOLT_DURATION_MS);
  });

  it('clamps bolt timer to min 0', () => {
    expect(clampClockValue('boltTimer', -5000)).toBe(0);
  });

  it('passes through values within range', () => {
    expect(clampClockValue('boltTimer', 300_000)).toBe(300_000);
  });

  it('clamps serve clock to max 14 seconds', () => {
    expect(clampClockValue('serveClock', 20_000)).toBe(SERVE_CLOCK_DURATION_MS);
  });

  it('returns unchanged for unknown clock', () => {
    expect(clampClockValue('unknown', 50_000)).toBe(50_000);
  });
});

describe('stepClockValue', () => {
  it('increments by 1 second', () => {
    expect(stepClockValue('boltTimer', 60_000, 'up')).toBe(61_000);
  });

  it('decrements by 1 second', () => {
    expect(stepClockValue('boltTimer', 60_000, 'down')).toBe(59_000);
  });

  it('does not exceed max', () => {
    expect(stepClockValue('boltTimer', BOLT_DURATION_MS, 'up')).toBe(BOLT_DURATION_MS);
  });

  it('does not go below 0', () => {
    expect(stepClockValue('serveClock', 0, 'down')).toBe(0);
  });

  it('clamps serve clock to 14 seconds max', () => {
    expect(stepClockValue('serveClock', SERVE_CLOCK_DURATION_MS, 'up')).toBe(SERVE_CLOCK_DURATION_MS);
  });
});

describe('parseTimeInput', () => {
  it('parses MM:SS', () => {
    expect(parseTimeInput('5:30')).toBe(330_000);
    expect(parseTimeInput('10:00')).toBe(600_000);
  });

  it('parses :SS', () => {
    expect(parseTimeInput(':14')).toBe(14_000);
    expect(parseTimeInput(':03')).toBe(3_000);
  });

  it('parses bare seconds', () => {
    expect(parseTimeInput('30')).toBe(30_000);
    expect(parseTimeInput('14')).toBe(14_000);
  });

  it('returns null for empty/invalid', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('1:2:3')).toBeNull();
  });
});
