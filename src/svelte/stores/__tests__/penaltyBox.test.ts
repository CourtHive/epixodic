import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock the clock module wholesale so these tests exercise the store's
 * control flow without pulling in the Clock class (which schedules real
 * requestAnimationFrame callbacks). Each spy is inspected per-test.
 */
vi.mock('../../../clock', () => {
  return {
    createClock: vi.fn((config: { id: string }) => ({
      id: config.id,
      getState: () => 'running',
      getRemainingMs: () => 0,
      getElapsedMs: () => 0,
    })),
    destroyClock: vi.fn(),
    getClockSnapshot: vi.fn(),
    pauseClock: vi.fn(),
    resumeClock: vi.fn(),
  };
});

import {
  createClock,
  destroyClock,
  getClockSnapshot,
  pauseClock,
  resumeClock,
} from '../../../clock';
import {
  sendToBox,
  releaseFromBox,
  resetPenaltyBox,
  isInBox,
  getBoxedPlayers,
  pauseAllPenaltyClocks,
  resumeAllPenaltyClocks,
  resumePenaltyClocksForBolt,
  isEligibleForBolt,
  setArcContext,
  getPenaltyBoxState,
} from '../penaltyBox.svelte';

type MockSnapshotMap = Record<
  string,
  { state: 'running' | 'paused' | 'expired' | 'idle'; remainingMs?: number; elapsedMs?: number }
>;

function stubSnapshots(map: MockSnapshotMap) {
  (getClockSnapshot as any).mockImplementation((id: string) =>
    map[id] ? { remainingMs: 0, elapsedMs: 0, ...map[id] } : undefined,
  );
}

describe('penaltyBox store', () => {
  beforeEach(() => {
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  describe('sendToBox', () => {
    it('creates a countdown clock and adds an entry', () => {
      sendToBox('p1', 'Alice', 1);
      expect(createClock).toHaveBeenCalledTimes(1);
      const cfg = (createClock as any).mock.calls[0][0];
      expect(cfg.id).toBe('penaltyBox-p1');
      expect(cfg.direction).toBe('down');
      expect(cfg.autoStart).toBe(true);
      expect(cfg.durationMs).toBe(120_000);
      expect(isInBox('p1')).toBe(true);
    });

    it('honours custom durationMs', () => {
      sendToBox('p1', 'Alice', 1, 60_000);
      const cfg = (createClock as any).mock.calls[0][0];
      expect(cfg.durationMs).toBe(60_000);
    });

    it('is idempotent for the same participant', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p1', 'Alice', 1);
      expect(createClock).toHaveBeenCalledTimes(1);
    });

    it('bumps the store version on success', () => {
      const before = getPenaltyBoxState().version;
      sendToBox('p1', 'Alice', 1);
      expect(getPenaltyBoxState().version).toBeGreaterThan(before);
    });

    it('invokes onRelease when the clock expires', () => {
      const onRelease = vi.fn();
      sendToBox('p1', 'Alice', 1, 1000, onRelease);
      const cfg = (createClock as any).mock.calls[0][0];
      // Simulate the clock firing onExpire
      cfg.onExpire?.();
      expect(onRelease).toHaveBeenCalledWith('p1');
      expect(isInBox('p1')).toBe(false);
    });
  });

  describe('releaseFromBox', () => {
    it('destroys the clock and removes the entry', () => {
      sendToBox('p1', 'Alice', 1);
      releaseFromBox('p1');
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(isInBox('p1')).toBe(false);
    });

    it('is safe to call for an unknown participant', () => {
      expect(() => releaseFromBox('does-not-exist')).not.toThrow();
    });
  });

  describe('getBoxedPlayers', () => {
    beforeEach(() => {
      sendToBox('p1', 'Alice', 1, 120_000, undefined, '7');
      sendToBox('p2', 'Bob', 2, 120_000, undefined, '12');
      stubSnapshots({
        'penaltyBox-p1': { state: 'running', remainingMs: 90_000 },
        'penaltyBox-p2': { state: 'running', remainingMs: 60_000 },
      });
    });

    it('returns all boxed players when no side is given', () => {
      const all = getBoxedPlayers();
      expect(all).toHaveLength(2);
      expect(all.map((p) => p.participantId).sort()).toEqual(['p1', 'p2']);
    });

    it('filters by side', () => {
      const side1 = getBoxedPlayers(1);
      expect(side1).toHaveLength(1);
      expect(side1[0].participantId).toBe('p1');
      expect(side1[0].jerseyNumber).toBe('7');
      expect(side1[0].remainingMs).toBe(90_000);
    });

    it('falls back to remainingMs=0 when snapshot is missing', () => {
      stubSnapshots({});
      const p1 = getBoxedPlayers(1)[0];
      expect(p1.remainingMs).toBe(0);
    });
  });

  describe('isInBox', () => {
    it('is true while penalised, false after release', () => {
      sendToBox('p1', 'Alice', 1);
      expect(isInBox('p1')).toBe(true);
      releaseFromBox('p1');
      expect(isInBox('p1')).toBe(false);
    });
  });

  describe('pauseAllPenaltyClocks', () => {
    it('pauses every running penalty clock', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p2', 'Bob', 2);
      stubSnapshots({
        'penaltyBox-p1': { state: 'running' },
        'penaltyBox-p2': { state: 'running' },
      });

      pauseAllPenaltyClocks();

      expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p2');
      expect(pauseClock).toHaveBeenCalledTimes(2);
    });

    it('skips clocks that are already paused or expired', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p2', 'Bob', 2);
      sendToBox('p3', 'Carol', 1);
      stubSnapshots({
        'penaltyBox-p1': { state: 'paused' },
        'penaltyBox-p2': { state: 'expired' },
        'penaltyBox-p3': { state: 'running' },
      });

      pauseAllPenaltyClocks();

      expect(pauseClock).toHaveBeenCalledTimes(1);
      expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p3');
    });

    it('is safe when the box is empty', () => {
      expect(() => pauseAllPenaltyClocks()).not.toThrow();
      expect(pauseClock).not.toHaveBeenCalled();
    });

    it('bumps the store version so subscribers re-render', () => {
      sendToBox('p1', 'Alice', 1);
      const before = getPenaltyBoxState().version;
      pauseAllPenaltyClocks();
      expect(getPenaltyBoxState().version).toBeGreaterThan(before);
    });
  });

  describe('resumeAllPenaltyClocks', () => {
    it('resumes every paused penalty clock', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p2', 'Bob', 2);
      stubSnapshots({
        'penaltyBox-p1': { state: 'paused' },
        'penaltyBox-p2': { state: 'paused' },
      });

      resumeAllPenaltyClocks();

      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p2');
      expect(resumeClock).toHaveBeenCalledTimes(2);
    });

    it('does not resume clocks that are running or expired', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p2', 'Bob', 2);
      stubSnapshots({
        'penaltyBox-p1': { state: 'running' },
        'penaltyBox-p2': { state: 'expired' },
      });

      resumeAllPenaltyClocks();

      expect(resumeClock).not.toHaveBeenCalled();
    });

    it('pairs with pauseAllPenaltyClocks — round trip', () => {
      sendToBox('p1', 'Alice', 1);

      stubSnapshots({ 'penaltyBox-p1': { state: 'running' } });
      pauseAllPenaltyClocks();
      expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');

      stubSnapshots({ 'penaltyBox-p1': { state: 'paused' } });
      resumeAllPenaltyClocks();
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
    });
  });

  describe('resetPenaltyBox', () => {
    it('destroys all clocks and clears entries', () => {
      sendToBox('p1', 'Alice', 1);
      sendToBox('p2', 'Bob', 2);
      resetPenaltyBox();
      expect(destroyClock).toHaveBeenCalledTimes(2);
      expect(getPenaltyBoxState().entries).toHaveLength(0);
      expect(isInBox('p1')).toBe(false);
      expect(isInBox('p2')).toBe(false);
    });

    it('rewinds the version counter', () => {
      sendToBox('p1', 'Alice', 1);
      expect(getPenaltyBoxState().version).toBeGreaterThan(0);
      resetPenaltyBox();
      expect(getPenaltyBoxState().version).toBe(0);
    });

    it('clears the arc context', () => {
      setArcContext('arc-A');
      expect(getPenaltyBoxState().arcId).toBe('arc-A');
      resetPenaltyBox();
      expect(getPenaltyBoxState().arcId).toBeUndefined();
    });
  });

  describe('sendToBox (gender-aware)', () => {
    it('stores the penalised player\'s gender on the entry', () => {
      sendToBox('p1', 'Alice', 1, 120_000, undefined, '7', 'FEMALE');
      const snapshot = getBoxedPlayers(1)[0];
      expect(snapshot.gender).toBe('FEMALE');
    });

    it('leaves gender undefined when not supplied (legacy callers)', () => {
      sendToBox('p1', 'Alice', 1);
      const snapshot = getBoxedPlayers(1)[0];
      expect(snapshot.gender).toBeUndefined();
    });
  });

  describe('isEligibleForBolt', () => {
    it('MIXED bolt accepts every player', () => {
      expect(isEligibleForBolt('MALE', { gender: 'MIXED' })).toBe(true);
      expect(isEligibleForBolt('FEMALE', { gender: 'MIXED' })).toBe(true);
      expect(isEligibleForBolt(undefined, { gender: 'MIXED' })).toBe(true);
    });

    it('matching gender is eligible', () => {
      expect(isEligibleForBolt('MALE', { gender: 'MALE' })).toBe(true);
      expect(isEligibleForBolt('FEMALE', { gender: 'FEMALE' })).toBe(true);
    });

    it('mismatched gender is ineligible', () => {
      expect(isEligibleForBolt('MALE', { gender: 'FEMALE' })).toBe(false);
      expect(isEligibleForBolt('FEMALE', { gender: 'MALE' })).toBe(false);
    });

    it('unknown gender on either side defaults to eligible', () => {
      // Backwards compatibility for legacy matchUps without gender metadata.
      expect(isEligibleForBolt(undefined, { gender: 'MALE' })).toBe(true);
      expect(isEligibleForBolt('MALE', { gender: undefined })).toBe(true);
      expect(isEligibleForBolt('MALE', undefined)).toBe(true);
    });
  });

  describe('resumePenaltyClocksForBolt', () => {
    beforeEach(() => {
      sendToBox('male1', 'Male One', 1, 120_000, undefined, undefined, 'MALE');
      sendToBox('male2', 'Male Two', 1, 120_000, undefined, undefined, 'MALE');
      sendToBox('female1', 'Female One', 2, 120_000, undefined, undefined, 'FEMALE');
    });

    it('resumes only players whose gender matches an MS/MD bolt', () => {
      stubSnapshots({
        'penaltyBox-male1': { state: 'paused' },
        'penaltyBox-male2': { state: 'paused' },
        'penaltyBox-female1': { state: 'paused' },
      });

      resumePenaltyClocksForBolt({ gender: 'MALE', matchUpType: 'SINGLES' });

      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male1');
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male2');
      expect(resumeClock).not.toHaveBeenCalledWith('penaltyBox-female1');
      expect(resumeClock).toHaveBeenCalledTimes(2);
    });

    it('resumes only the female during WS/WD bolts', () => {
      stubSnapshots({
        'penaltyBox-male1': { state: 'paused' },
        'penaltyBox-male2': { state: 'paused' },
        'penaltyBox-female1': { state: 'paused' },
      });

      resumePenaltyClocksForBolt({ gender: 'FEMALE', matchUpType: 'DOUBLES' });

      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-female1');
      expect(resumeClock).toHaveBeenCalledTimes(1);
    });

    it('resumes every paused clock on a MIXED bolt', () => {
      stubSnapshots({
        'penaltyBox-male1': { state: 'paused' },
        'penaltyBox-male2': { state: 'paused' },
        'penaltyBox-female1': { state: 'paused' },
      });

      resumePenaltyClocksForBolt({ gender: 'MIXED', matchUpType: 'DOUBLES' });

      expect(resumeClock).toHaveBeenCalledTimes(3);
    });

    it('skips clocks that are not paused', () => {
      stubSnapshots({
        'penaltyBox-male1': { state: 'running' },
        'penaltyBox-male2': { state: 'expired' },
        'penaltyBox-female1': { state: 'paused' },
      });

      resumePenaltyClocksForBolt({ gender: 'MIXED' });

      expect(resumeClock).toHaveBeenCalledTimes(1);
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-female1');
    });

    it('is safe when bolt context is undefined (treats as "any player eligible")', () => {
      stubSnapshots({
        'penaltyBox-male1': { state: 'paused' },
        'penaltyBox-female1': { state: 'paused' },
      });

      resumePenaltyClocksForBolt(undefined);

      expect(resumeClock).toHaveBeenCalledTimes(2);
    });
  });

  describe('setArcContext', () => {
    it('records the current arc id', () => {
      setArcContext('arc-A');
      expect(getPenaltyBoxState().arcId).toBe('arc-A');
    });

    it('is a no-op when called with the same arc id — penalties persist', () => {
      sendToBox('p1', 'Alice', 1, 120_000, undefined, undefined, 'FEMALE');
      setArcContext('arc-A');
      expect(getBoxedPlayers()).toHaveLength(1);

      // Same ARC, different tieMatchUp mounts — penalty carries over.
      setArcContext('arc-A');
      expect(getBoxedPlayers()).toHaveLength(1);
      expect(destroyClock).not.toHaveBeenCalled();
    });

    it('clears every penalty when a different arc is entered', () => {
      sendToBox('p1', 'Alice', 1, 120_000, undefined, undefined, 'FEMALE');
      sendToBox('p2', 'Bob', 2, 120_000, undefined, undefined, 'MALE');
      setArcContext('arc-A');
      expect(getBoxedPlayers()).toHaveLength(2);

      setArcContext('arc-B');

      expect(getBoxedPlayers()).toHaveLength(0);
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p2');
      expect(getPenaltyBoxState().arcId).toBe('arc-B');
    });

    it('initial call from undefined → defined adopts the arc and preserves entries', () => {
      // First mount of the ARC: arcId starts undefined. Any entries that
      // exist at this point (e.g. created by a test before the component
      // mounted, or by future persistence-hydration work) should survive
      // the adoption — we have no prior ARC to "leave from".
      sendToBox('p1', 'Alice', 1);
      expect(getBoxedPlayers()).toHaveLength(1);

      setArcContext('arc-first');

      expect(getBoxedPlayers()).toHaveLength(1);
      expect(getPenaltyBoxState().arcId).toBe('arc-first');
      expect(destroyClock).not.toHaveBeenCalled();
    });

    it('tearing down the arc (X → undefined) clears the box', () => {
      setArcContext('arc-A');
      sendToBox('p1', 'Alice', 1);

      setArcContext(undefined);

      expect(getBoxedPlayers()).toHaveLength(0);
      expect(getPenaltyBoxState().arcId).toBeUndefined();
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p1');
    });
  });
});
