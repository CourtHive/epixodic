import { describe, it, expect } from 'vitest';
import {
  onBoltStart,
  onRallyStart,
  onPointComplete,
  onTimeoutStart,
  onTimeoutEnd,
  BOLT_DURATION_MS,
  SERVE_CLOCK_DURATION_MS,
  TIMEOUT_DURATION_MS,
} from '../clockOrchestration';

describe('clockOrchestration', () => {
  describe('onBoltStart', () => {
    it('restarts both bolt timer and serve clock', () => {
      const commands = onBoltStart();
      expect(commands).toEqual([
        { type: 'restart', clockId: 'boltTimer' },
        { type: 'restart', clockId: 'serveClock' },
      ]);
    });
  });

  describe('onRallyStart', () => {
    it('pauses the serve clock', () => {
      const commands = onRallyStart();
      expect(commands).toEqual([
        { type: 'pause', clockId: 'serveClock' },
      ]);
    });
  });

  describe('onPointComplete', () => {
    it('restarts the serve clock', () => {
      const commands = onPointComplete();
      expect(commands).toEqual([
        { type: 'restart', clockId: 'serveClock' },
      ]);
    });
  });

  describe('onTimeoutStart', () => {
    it('pauses bolt timer and creates timeout timer', () => {
      const commands = onTimeoutStart(false);
      expect(commands).toHaveLength(2);
      expect(commands[0]).toEqual({ type: 'pause', clockId: 'boltTimer' });
      expect(commands[1]).toMatchObject({
        type: 'create',
        clockId: 'timeoutTimer',
        durationMs: TIMEOUT_DURATION_MS,
        autoStart: true,
      });
    });

    it('also pauses serve clock if it was running', () => {
      const commands = onTimeoutStart(true);
      expect(commands).toHaveLength(3);
      expect(commands[0]).toEqual({ type: 'pause', clockId: 'boltTimer' });
      expect(commands[1]).toEqual({ type: 'pause', clockId: 'serveClock' });
      expect(commands[2]).toMatchObject({ type: 'create', clockId: 'timeoutTimer' });
    });
  });

  describe('onTimeoutEnd', () => {
    it('destroys timeout timer and resumes bolt timer', () => {
      const commands = onTimeoutEnd(false);
      expect(commands).toEqual([
        { type: 'destroy', clockId: 'timeoutTimer' },
        { type: 'resume', clockId: 'boltTimer' },
      ]);
    });

    it('also restarts serve clock if it was running before timeout', () => {
      const commands = onTimeoutEnd(true);
      expect(commands).toEqual([
        { type: 'destroy', clockId: 'timeoutTimer' },
        { type: 'resume', clockId: 'boltTimer' },
        { type: 'restart', clockId: 'serveClock' },
      ]);
    });
  });

  describe('constants', () => {
    it('bolt duration is 10 minutes', () => {
      expect(BOLT_DURATION_MS).toBe(600_000);
    });

    it('serve clock is 14 seconds', () => {
      expect(SERVE_CLOCK_DURATION_MS).toBe(14_000);
    });

    it('timeout is 60 seconds', () => {
      expect(TIMEOUT_DURATION_MS).toBe(60_000);
    });
  });
});
