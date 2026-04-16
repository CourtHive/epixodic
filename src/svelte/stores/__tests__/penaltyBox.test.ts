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
  });
});
