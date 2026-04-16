import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for the "bolt clock paused ⇒ penalty clock paused"
 * contract, exercised everywhere `BoltScoringPage` pauses the bolt clock:
 *
 *   - startBreakClock()      → pauseAllPenaltyClocks
 *   - handleNextBolt()       → resumeAllPenaltyClocks
 *   - handleTimeout()        → pauseAllPenaltyClocks
 *   - handleDismissTimeout() → resumeAllPenaltyClocks
 *   - handleCancelTimeout()  → resumeAllPenaltyClocks
 *
 * The component itself is not mounted — we exercise the same helpers the
 * component does, end-to-end through the real `penaltyBox` store, with the
 * underlying `clock` module stubbed so we can script each clock's state
 * transitions deterministically.
 */

const mockStates: Record<string, 'running' | 'paused' | 'expired' | 'idle'> = {};

vi.mock('../../../clock', () => {
  return {
    createClock: vi.fn((config: { id: string }) => {
      mockStates[config.id] = 'running';
      return {
        id: config.id,
        getState: () => mockStates[config.id] ?? 'idle',
        getRemainingMs: () => 0,
        getElapsedMs: () => 0,
      };
    }),
    destroyClock: vi.fn((id: string) => {
      delete mockStates[id];
    }),
    getClockSnapshot: vi.fn((id: string) => {
      const state = mockStates[id];
      return state ? { remainingMs: 0, elapsedMs: 0, state } : undefined;
    }),
    pauseClock: vi.fn((id: string) => {
      if (mockStates[id] === 'running') mockStates[id] = 'paused';
    }),
    resumeClock: vi.fn((id: string) => {
      if (mockStates[id] === 'paused') mockStates[id] = 'running';
    }),
  };
});

import {
  sendToBox,
  releaseFromBox,
  resetPenaltyBox,
  pauseAllPenaltyClocks,
  resumeAllPenaltyClocks,
  getBoxedPlayers,
} from '../penaltyBox.svelte';
import { getClockSnapshot, pauseClock, resumeClock } from '../../../clock';

describe('break-flow integration — penalty clocks pause across the break', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  it('freezes an active penalty timer for the duration of a break', () => {
    sendToBox('p1', 'Alice', 1, 120_000);
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');

    // Bolt ends → break begins. Component calls pauseAllPenaltyClocks().
    pauseAllPenaltyClocks();
    expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');

    // Next bolt begins. Component calls resumeAllPenaltyClocks().
    resumeAllPenaltyClocks();
    expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');
  });

  it('round-trips across multiple break cycles for the same penalty', () => {
    sendToBox('p1', 'Alice', 1);

    for (let i = 0; i < 3; i += 1) {
      pauseAllPenaltyClocks();
      expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');
      resumeAllPenaltyClocks();
      expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');
    }
  });

  it('does not resume a penalty that expired during the break', () => {
    sendToBox('p1', 'Alice', 1);
    // Simulate the clock expiring during the break
    mockStates['penaltyBox-p1'] = 'expired';

    resumeAllPenaltyClocks();
    // Expired → stays expired; resumeClock was a no-op because state !== paused
    expect(resumeClock).not.toHaveBeenCalled();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('expired');
  });

  it('handles multiple concurrent penalties on both sides', () => {
    sendToBox('p1', 'Alice', 1);
    sendToBox('p2', 'Bob', 2);
    sendToBox('p3', 'Carol', 1);

    pauseAllPenaltyClocks();
    expect(pauseClock).toHaveBeenCalledTimes(3);
    expect(getBoxedPlayers()).toHaveLength(3);
    for (const id of ['penaltyBox-p1', 'penaltyBox-p2', 'penaltyBox-p3']) {
      expect(getClockSnapshot(id)?.state).toBe('paused');
    }

    resumeAllPenaltyClocks();
    expect(resumeClock).toHaveBeenCalledTimes(3);
    for (const id of ['penaltyBox-p1', 'penaltyBox-p2', 'penaltyBox-p3']) {
      expect(getClockSnapshot(id)?.state).toBe('running');
    }
  });

  it('releasing a player during the break clears their clock entirely', () => {
    sendToBox('p1', 'Alice', 1);
    pauseAllPenaltyClocks();
    releaseFromBox('p1');
    expect(getClockSnapshot('penaltyBox-p1')).toBeUndefined();

    // Resume is a no-op for a released player
    resumeAllPenaltyClocks();
    expect(resumeClock).not.toHaveBeenCalled();
    expect(getBoxedPlayers()).toHaveLength(0);
  });

  it('resetPenaltyBox at mount time clears stale entries from a prior tieMatchUp', () => {
    // Simulate tieMatchUp A state: penalty + paused (between bolts).
    sendToBox('A1', 'A1', 1);
    pauseAllPenaltyClocks();
    expect(getBoxedPlayers()).toHaveLength(1);

    // BoltScoringPage onMount for tieMatchUp B calls resetPenaltyBox().
    resetPenaltyBox();

    // B starts clean — no carryover penalty.
    expect(getBoxedPlayers()).toHaveLength(0);
    expect(getClockSnapshot('penaltyBox-A1')).toBeUndefined();
  });
});

describe('timeout-flow integration — penalty clocks pause across the timeout', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  it('freezes an active penalty timer when a timeout is called', () => {
    sendToBox('p1', 'Alice', 1, 120_000);
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');

    // Timeout called → component calls pauseAllPenaltyClocks().
    pauseAllPenaltyClocks();
    expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');

    // END TIMEOUT → component calls resumeAllPenaltyClocks().
    resumeAllPenaltyClocks();
    expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');
  });

  it('resumes penalty clocks the same way for END TIMEOUT and CANCEL', () => {
    // The component calls resumeAllPenaltyClocks in both handleDismissTimeout
    // and handleCancelTimeout — behaviour is symmetric regardless of whether
    // the timeout counted against the team's 5-per-ARC quota.
    sendToBox('p1', 'Alice', 1);

    pauseAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');
    resumeAllPenaltyClocks(); // e.g. END TIMEOUT
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');

    pauseAllPenaltyClocks();
    resumeAllPenaltyClocks(); // e.g. CANCEL (doesn't count)
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');
  });

  it('a penalty issued *during* a timeout ticks down normally after the box entry is created', () => {
    // Scenario: ref hits Penalty while timeout overlay is up. sendToBox still
    // creates the clock (autoStart), and the penalty-pause-during-timeout
    // rule is the caller's responsibility — once the caller triggers it, the
    // clock ends up paused as expected.
    sendToBox('mid-timeout-p', 'Bob', 2);
    expect(getClockSnapshot('penaltyBox-mid-timeout-p')?.state).toBe('running');

    pauseAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-mid-timeout-p')?.state).toBe('paused');

    resumeAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-mid-timeout-p')?.state).toBe('running');
  });

  it('a single penalty survives a timeout followed immediately by a break', () => {
    // Common sequence: penalty → timeout called (60s) → timeout ends →
    // bolt expires → between-bolts break → next bolt. The penalty clock
    // must pause twice and resume twice, with no double-counting.
    sendToBox('p1', 'Alice', 1);

    // Timeout cycle.
    pauseAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');
    resumeAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');

    // Break cycle.
    pauseAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');
    resumeAllPenaltyClocks();
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('running');

    expect(pauseClock).toHaveBeenCalledTimes(2);
    expect(resumeClock).toHaveBeenCalledTimes(2);
  });
});
