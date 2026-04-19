import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

/**
 * Polyfill `requestAnimationFrame` / `cancelAnimationFrame` under vitest's
 * default node environment. The real Clock (used by the playerTime store)
 * schedules rAF even when it never ticks to completion. We only need the
 * scheduler to hand back an opaque id — the callbacks are never flushed in
 * these tests, so no queue is kept.
 */
let rafHandles = 0;
beforeAll(() => {
  (globalThis as any).requestAnimationFrame = (_cb: (now: number) => void) => {
    rafHandles += 1;
    return rafHandles;
  };
  (globalThis as any).cancelAnimationFrame = (_id: number) => {
    /* no queue — stubs only */
  };
});

import {
  registerPlayer,
  registerPlayers,
  setOnCourt,
  startTracking,
  stopTracking,
  handleSubstitution,
  pauseAllOnCourtClocks,
  resumeAllOnCourtClocks,
  getCourtTimeMs,
  getRemainingMs,
  isTimeExhausted,
  checkTimeLimit,
  getAllCourtTimes,
  getOnCourtPlayers,
  getBenchPlayers,
  getPlayerTimeSnapshots,
  restorePlayerTimeSnapshots,
  setMaxCourtTime,
  resetPlayerTimes,
  getPlayerTimeState,
} from '../playerTime.svelte';

const DEFAULT_MAX_MS = 12 * 60 * 1000;

describe('playerTime store', () => {
  beforeEach(() => {
    resetPlayerTimes();
    setMaxCourtTime(DEFAULT_MAX_MS);
  });

  describe('registerPlayer', () => {
    it('creates an entry with isOnCourt=false by default', () => {
      registerPlayer('p1', 'Alice', 'MALE', '7');
      const state = getPlayerTimeState();
      expect(state.players['p1'].participantName).toBe('Alice');
      expect(state.players['p1'].gender).toBe('MALE');
      expect(state.players['p1'].jerseyNumber).toBe('7');
      expect(state.players['p1'].isOnCourt).toBe(false);
    });

    it('is idempotent — repeat calls do not overwrite existing entry', () => {
      registerPlayer('p1', 'Alice');
      setOnCourt('p1');
      registerPlayer('p1', 'Alice-New-Name');
      expect(getPlayerTimeState().players['p1'].participantName).toBe('Alice');
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
    });
  });

  describe('registerPlayers', () => {
    it('registers every participant in the roster', () => {
      registerPlayers([
        { participantId: 'p1', participantName: 'Alice' },
        { participantId: 'p2', participantName: 'Bob', gender: 'MALE' },
      ]);
      expect(getPlayerTimeState().players['p1']).toBeTruthy();
      expect(getPlayerTimeState().players['p2']).toBeTruthy();
    });
  });

  describe('setOnCourt', () => {
    beforeEach(() => {
      registerPlayer('p1', 'Alice');
    });

    it('flips isOnCourt to true without starting the clock', () => {
      setOnCourt('p1');
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
      expect(getCourtTimeMs('p1')).toBe(0);
    });

    it('is safe to call for an unknown participant', () => {
      expect(() => setOnCourt('nope')).not.toThrow();
    });

    it('is idempotent', () => {
      setOnCourt('p1');
      const beforeVersion = getPlayerTimeState().version;
      setOnCourt('p1');
      expect(getPlayerTimeState().version).toBe(beforeVersion);
    });
  });

  describe('startTracking / stopTracking', () => {
    beforeEach(() => {
      registerPlayer('p1', 'Alice');
    });

    it('startTracking flips isOnCourt=true', () => {
      startTracking('p1');
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
    });

    it('stopTracking flips isOnCourt=false', () => {
      startTracking('p1');
      stopTracking('p1');
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(false);
    });

    it('stopTracking on an off-court player is a no-op', () => {
      const beforeVersion = getPlayerTimeState().version;
      stopTracking('p1');
      expect(getPlayerTimeState().version).toBe(beforeVersion);
    });
  });

  describe('handleSubstitution', () => {
    it('swaps on-court status from out to in', () => {
      registerPlayer('out', 'Out');
      registerPlayer('in', 'In');
      startTracking('out');
      handleSubstitution('out', 'in');
      expect(getPlayerTimeState().players['out'].isOnCourt).toBe(false);
      expect(getPlayerTimeState().players['in'].isOnCourt).toBe(true);
    });
  });

  describe('remaining / exhausted', () => {
    beforeEach(() => {
      registerPlayer('p1', 'Alice');
    });

    it('getRemainingMs returns maxCourtTimeMs for a fresh player', () => {
      expect(getRemainingMs('p1')).toBe(DEFAULT_MAX_MS);
    });

    it('getRemainingMs clamps at zero when elapsed exceeds max', () => {
      // Simulate prior play by restoring a snapshot that exhausted the budget
      restorePlayerTimeSnapshots({ p1: { elapsedMs: DEFAULT_MAX_MS + 5000 } });
      expect(getRemainingMs('p1')).toBe(0);
    });

    it('isTimeExhausted mirrors remaining <= 0', () => {
      expect(isTimeExhausted('p1')).toBe(false);
      restorePlayerTimeSnapshots({ p1: { elapsedMs: DEFAULT_MAX_MS } });
      expect(isTimeExhausted('p1')).toBe(true);
    });

    it('checkTimeLimit returns the full triple', () => {
      const check = checkTimeLimit('p1');
      expect(check).toEqual({
        exceeded: false,
        remainingMs: DEFAULT_MAX_MS,
        elapsedMs: 0,
      });
    });

    it('setMaxCourtTime changes the budget', () => {
      setMaxCourtTime(60_000);
      expect(getRemainingMs('p1')).toBe(60_000);
    });
  });

  describe('getAllCourtTimes / getOnCourtPlayers / getBenchPlayers', () => {
    beforeEach(() => {
      registerPlayer('a1', 'A1', 'MALE');
      registerPlayer('a2', 'A2', 'FEMALE');
      registerPlayer('b1', 'B1', 'MALE');
      setOnCourt('a1');
      setOnCourt('b1');
    });

    it('getAllCourtTimes includes every registered player', () => {
      const times = getAllCourtTimes();
      expect(Object.keys(times).sort()).toEqual(['a1', 'a2', 'b1']);
      expect(times['a1'].isOnCourt).toBe(true);
      expect(times['a2'].isOnCourt).toBe(false);
    });

    it('getOnCourtPlayers filters by side when sideRoster is provided', () => {
      const roster = { a1: 1, a2: 1, b1: 2 } as Record<string, 1 | 2>;
      const side1 = getOnCourtPlayers(1, roster);
      expect(side1.map((p) => p.participantId)).toEqual(['a1']);
    });

    it('getBenchPlayers returns off-court side members', () => {
      const roster = { a1: 1, a2: 1, b1: 2 } as Record<string, 1 | 2>;
      const bench = getBenchPlayers(1, roster);
      expect(bench.map((p) => p.participantId)).toEqual(['a2']);
    });

    it('getBenchPlayers filters by gender when supplied', () => {
      const roster = { a1: 1, a2: 1, b1: 2 } as Record<string, 1 | 2>;
      const bench = getBenchPlayers(1, roster, 'FEMALE');
      expect(bench.map((p) => p.participantId)).toEqual(['a2']);
      const benchMale = getBenchPlayers(1, roster, 'MALE');
      // a2 is FEMALE and there are no other side-1 bench players → empty
      expect(benchMale).toEqual([]);
    });
  });

  describe('restorePlayerTimeSnapshots — isOnCourt NOT restored', () => {
    // This is the critical regression test for the 3-on-court fix. Before
    // the fix, a corrupted snapshot could reintroduce stale `isOnCourt=true`
    // flags for players who were not actually in the current tieMatchUp's
    // active lineup, producing the "3 players on court" bug.

    it('does not flip a bench player on-court even when snapshot says true', () => {
      registerPlayer('p1', 'Alice');
      // p1 is on the bench (isOnCourt=false)
      restorePlayerTimeSnapshots({
        p1: { elapsedMs: 5000, isOnCourt: true } as any,
      });
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(false);
    });

    it('does not flip an on-court player off-court when snapshot says false', () => {
      registerPlayer('p1', 'Alice');
      setOnCourt('p1');
      restorePlayerTimeSnapshots({
        p1: { elapsedMs: 5000, isOnCourt: false } as any,
      });
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
    });

    it('still restores elapsedMs so time accounting continues across bolts', () => {
      registerPlayer('p1', 'Alice');
      setOnCourt('p1');
      restorePlayerTimeSnapshots({ p1: { elapsedMs: 4 * 60 * 1000 } });
      expect(getCourtTimeMs('p1')).toBe(4 * 60 * 1000);
      expect(getRemainingMs('p1')).toBe(DEFAULT_MAX_MS - 4 * 60 * 1000);
    });

    it('skips snapshot entries for players not in the current roster', () => {
      registerPlayer('p1', 'Alice');
      restorePlayerTimeSnapshots({
        p1: { elapsedMs: 1000 },
        ghost: { elapsedMs: 1000 },
      });
      expect(getCourtTimeMs('p1')).toBe(1000);
      expect(getPlayerTimeState().players['ghost']).toBeUndefined();
    });

    it('tolerates snapshots from older versions (no isOnCourt field)', () => {
      registerPlayer('p1', 'Alice');
      setOnCourt('p1');
      restorePlayerTimeSnapshots({ p1: { elapsedMs: 2000 } });
      expect(getCourtTimeMs('p1')).toBe(2000);
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
    });
  });

  describe('getPlayerTimeSnapshots', () => {
    it('captures elapsedMs and isOnCourt for every registered player', () => {
      registerPlayer('p1', 'Alice');
      registerPlayer('p2', 'Bob');
      setOnCourt('p1');
      const snap = getPlayerTimeSnapshots();
      expect(snap['p1']).toEqual({ elapsedMs: 0, isOnCourt: true });
      expect(snap['p2']).toEqual({ elapsedMs: 0, isOnCourt: false });
    });
  });

  describe('resetPlayerTimes', () => {
    it('clears all entries and resets the version counter', () => {
      registerPlayer('p1', 'Alice');
      registerPlayer('p2', 'Bob');
      setOnCourt('p1');
      expect(getPlayerTimeState().version).toBeGreaterThan(0);

      resetPlayerTimes();

      expect(Object.keys(getPlayerTimeState().players)).toEqual([]);
      expect(getPlayerTimeState().version).toBe(0);
    });

    it('closes the cross-tieMatchUp bleed path', () => {
      // Simulate tieMatchUp A: M1 and M2 active, M2 substituted in mid-bolt.
      registerPlayer('M1', 'M1');
      registerPlayer('M2', 'M2');
      registerPlayer('M3', 'M3');
      startTracking('M1');
      handleSubstitution('M1', 'M2');
      expect(getPlayerTimeState().players['M2'].isOnCourt).toBe(true);

      // tieMatchUp ends; component remounts without reset — historical bug.
      // WITH reset, every flag is cleared before the new tieMatchUp registers.
      resetPlayerTimes();

      // tieMatchUp B mounts with M1 + M3 as the new active lineup.
      registerPlayer('M1', 'M1');
      registerPlayer('M2', 'M2'); // still in team roster
      registerPlayer('M3', 'M3');
      setOnCourt('M1');
      setOnCourt('M3');

      // Only the two actively-selected players are on court — not M2.
      const onCourt = Object.values(getPlayerTimeState().players).filter((p) => p.isOnCourt);
      expect(onCourt.map((p) => p.participantId).sort()).toEqual(['M1', 'M3']);
    });
  });

  describe('pauseAllOnCourtClocks / resumeAllOnCourtClocks', () => {
    it('only affect on-court players and bump the version', () => {
      registerPlayer('p1', 'Alice');
      registerPlayer('p2', 'Bob');
      setOnCourt('p1');
      const beforeVersion = getPlayerTimeState().version;

      pauseAllOnCourtClocks();
      expect(getPlayerTimeState().version).toBeGreaterThan(beforeVersion);

      // isOnCourt is not altered by pause/resume — only the clock state is.
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
      expect(getPlayerTimeState().players['p2'].isOnCourt).toBe(false);

      resumeAllOnCourtClocks();
      expect(getPlayerTimeState().players['p1'].isOnCourt).toBe(true);
    });
  });
});
