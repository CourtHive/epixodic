import { describe, it, expect } from 'vitest';
import { isTimeoutButtonDisabled } from '../boltControls';

describe('isTimeoutButtonDisabled', () => {
  describe('break-active lockout', () => {
    it('is disabled when a break is active', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: true, timeoutsRemaining: 3 }),
      ).toBe(true);
    });

    it('is enabled when the break ends (and quota remains)', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: false, timeoutsRemaining: 3 }),
      ).toBe(false);
    });

    it('break-active wins even when the side is out of timeouts — still disabled', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: true, timeoutsRemaining: 0 }),
      ).toBe(true);
    });
  });

  describe('timeout quota', () => {
    it('is disabled when zero timeouts remain', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: false, timeoutsRemaining: 0 }),
      ).toBe(true);
    });

    it('is enabled with at least one timeout remaining', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: false, timeoutsRemaining: 1 }),
      ).toBe(false);
    });

    it('treats negative (bad data) as disabled', () => {
      expect(
        isTimeoutButtonDisabled({ breakActive: false, timeoutsRemaining: -1 }),
      ).toBe(true);
    });
  });

  describe('requireBoltStarted (Horizontal layout)', () => {
    it('is disabled before the bolt starts when required', () => {
      expect(
        isTimeoutButtonDisabled({
          breakActive: false,
          timeoutsRemaining: 3,
          requireBoltStarted: true,
          boltStarted: false,
        }),
      ).toBe(true);
    });

    it('is enabled once the bolt has started', () => {
      expect(
        isTimeoutButtonDisabled({
          breakActive: false,
          timeoutsRemaining: 3,
          requireBoltStarted: true,
          boltStarted: true,
        }),
      ).toBe(false);
    });

    it('boltStarted does not matter when requireBoltStarted is false', () => {
      expect(
        isTimeoutButtonDisabled({
          breakActive: false,
          timeoutsRemaining: 3,
          requireBoltStarted: false,
          boltStarted: false,
        }),
      ).toBe(false);
    });
  });

  describe('full matrix — Horizontal layout', () => {
    // Horizontal is the strictest: disable if any condition is hit
    const row = (breakActive: boolean, boltStarted: boolean, remaining: number) =>
      isTimeoutButtonDisabled({
        breakActive,
        timeoutsRemaining: remaining,
        requireBoltStarted: true,
        boltStarted,
      });

    it('enabled only with bolt started, no break, and remaining > 0', () => {
      expect(row(false, true, 1)).toBe(false);
    });

    it('any single negative condition disables the button', () => {
      // bolt not started
      expect(row(false, false, 1)).toBe(true);
      // break active
      expect(row(true, true, 1)).toBe(true);
      // no remaining
      expect(row(false, true, 0)).toBe(true);
    });
  });

  describe('full matrix — Vertical layout', () => {
    // Vertical omits the boltStarted gate historically; only break + quota apply.
    const row = (breakActive: boolean, remaining: number) =>
      isTimeoutButtonDisabled({ breakActive, timeoutsRemaining: remaining });

    it('enabled pre-bolt as long as break is not active and quota > 0', () => {
      // This encodes the existing Vertical behavior — documented by test.
      expect(row(false, 3)).toBe(false);
    });

    it('disabled once the between-bolts break starts', () => {
      expect(row(true, 3)).toBe(true);
    });
  });
});
