import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock the clock module wholesale so these tests exercise the store's
 * control flow without pulling in the Clock class (which schedules real
 * requestAnimationFrame callbacks). Each spy is inspected per-test.
 */
const mockStates: Record<
  string,
  { state: 'running' | 'paused' | 'expired' | 'idle'; remainingMs?: number }
> = {};

vi.mock('../../../clock', () => {
  return {
    createClock: vi.fn((config: { id: string; durationMs: number; autoStart?: boolean }) => {
      mockStates[config.id] = {
        state: config.autoStart ? 'running' : 'idle',
        remainingMs: config.durationMs,
      };
      return { id: config.id };
    }),
    destroyClock: vi.fn((id: string) => {
      delete mockStates[id];
    }),
    getClockSnapshot: vi.fn((id: string) => {
      const s = mockStates[id];
      return s ? { remainingMs: s.remainingMs ?? 0, elapsedMs: 0, state: s.state } : undefined;
    }),
    pauseClock: vi.fn((id: string) => {
      if (mockStates[id]?.state === 'running') mockStates[id].state = 'paused';
    }),
    resumeClock: vi.fn((id: string) => {
      if (mockStates[id]?.state === 'paused') mockStates[id].state = 'running';
    }),
    setClockRemaining: vi.fn((id: string, ms: number) => {
      if (mockStates[id]) mockStates[id].remainingMs = ms;
    }),
  };
});

import {
  createClock,
  destroyClock,
  getClockSnapshot,
  pauseClock,
  resumeClock,
  setClockRemaining,
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
  hydrateFromTeamMatchUp,
  setPersistCallback,
  getPenaltyBoxState,
} from '../penaltyBox.svelte';

function scriptSnapshot(id: string, state: 'running' | 'paused' | 'expired' | 'idle', remainingMs = 0) {
  mockStates[id] = { state, remainingMs };
}

const baseSendOpts = (sourceTieMatchUpId = 'tie-A', sourcePointIndex = 0) => ({
  sourceTieMatchUpId,
  sourcePointIndex,
});

describe('penaltyBox store', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  // ── sendToBox / releaseFromBox / isInBox / getBoxedPlayers ──

  describe('sendToBox', () => {
    it('creates a countdown clock and records an entry', () => {
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      expect(createClock).toHaveBeenCalledTimes(1);
      const cfg = (createClock as any).mock.calls[0][0];
      expect(cfg.id).toBe('penaltyBox-p1');
      expect(cfg.direction).toBe('down');
      expect(cfg.durationMs).toBe(120_000);
      expect(cfg.autoStart).toBe(false);
      expect(isInBox('p1')).toBe(true);
    });

    it('honours custom durationMs', () => {
      sendToBox('p1', 'Alice', 1, { ...baseSendOpts(), durationMs: 60_000 });
      const cfg = (createClock as any).mock.calls[0][0];
      expect(cfg.durationMs).toBe(60_000);
    });

    it('autoStart propagates to the clock when the caller opts in', () => {
      sendToBox('p1', 'Alice', 1, { ...baseSendOpts(), autoStart: true });
      const cfg = (createClock as any).mock.calls[0][0];
      expect(cfg.autoStart).toBe(true);
    });

    it('stores gender + source location on the entry', () => {
      sendToBox('p1', 'Alice', 1, {
        ...baseSendOpts('tie-MS', 3),
        gender: 'MALE',
      });
      const entry = getPenaltyBoxState().entries[0];
      expect(entry.gender).toBe('MALE');
      expect(entry.sourceTieMatchUpId).toBe('tie-MS');
      expect(entry.sourcePointIndex).toBe(3);
      expect(entry.durationMs).toBe(120_000);
      expect(entry.servedMs).toBe(0);
    });

    it('is idempotent for the same participant', () => {
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      expect(createClock).toHaveBeenCalledTimes(1);
    });

    it('bumps the store version', () => {
      const before = getPenaltyBoxState().version;
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      expect(getPenaltyBoxState().version).toBeGreaterThan(before);
    });
  });

  describe('releaseFromBox', () => {
    it('destroys the clock and removes the entry', () => {
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      releaseFromBox('p1');
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(isInBox('p1')).toBe(false);
    });

    it('is a safe no-op for an unknown participant', () => {
      expect(() => releaseFromBox('ghost')).not.toThrow();
    });
  });

  describe('getBoxedPlayers', () => {
    beforeEach(() => {
      sendToBox('p1', 'Alice', 1, { ...baseSendOpts(), jerseyNumber: '7', gender: 'FEMALE' });
      sendToBox('p2', 'Bob', 2, { ...baseSendOpts('tie-A', 1), jerseyNumber: '12', gender: 'MALE' });
      scriptSnapshot('penaltyBox-p1', 'running', 90_000);
      scriptSnapshot('penaltyBox-p2', 'running', 60_000);
    });

    it('returns all boxed players when no side filter is given', () => {
      const all = getBoxedPlayers();
      expect(all.map((p) => p.participantId).sort()).toEqual(['p1', 'p2']);
    });

    it('filters by side and projects remainingMs from the clock snapshot', () => {
      const side1 = getBoxedPlayers(1);
      expect(side1).toHaveLength(1);
      expect(side1[0].participantId).toBe('p1');
      expect(side1[0].jerseyNumber).toBe('7');
      expect(side1[0].gender).toBe('FEMALE');
      expect(side1[0].remainingMs).toBe(90_000);
    });

    it('falls back to durationMs − servedMs when the clock snapshot is missing', () => {
      // Destroy the clock snapshot, leave the entry alone.
      delete mockStates['penaltyBox-p1'];
      const p1 = getBoxedPlayers(1)[0];
      // servedMs hasn't accumulated yet → remaining = durationMs.
      expect(p1.remainingMs).toBe(120_000);
    });
  });

  // ── isEligibleForBolt ───────────────────────────────────────

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
      expect(isEligibleForBolt(undefined, { gender: 'MALE' })).toBe(true);
      expect(isEligibleForBolt('MALE', {})).toBe(true);
      expect(isEligibleForBolt('MALE', undefined)).toBe(true);
    });
  });

  // ── pause / resume ──────────────────────────────────────────

  describe('pauseAllPenaltyClocks', () => {
    it('pauses every running clock and flushes servedMs via persist callback', () => {
      const persist = vi.fn();
      setPersistCallback(persist);
      sendToBox('p1', 'Alice', 1, { ...baseSendOpts('tie-MS', 4), gender: 'MALE' });
      scriptSnapshot('penaltyBox-p1', 'running', 90_000); // 30s served

      pauseAllPenaltyClocks();

      expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');
      expect(persist).toHaveBeenCalledWith('tie-MS', 4, { penaltyServedMs: 30_000 });
      expect(getPenaltyBoxState().entries[0].servedMs).toBe(30_000);
    });

    it('skips clocks that are not running', () => {
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      sendToBox('p2', 'Bob', 2, baseSendOpts('tie-A', 1));
      scriptSnapshot('penaltyBox-p1', 'paused', 90_000);
      scriptSnapshot('penaltyBox-p2', 'expired', 0);

      pauseAllPenaltyClocks();

      expect(pauseClock).not.toHaveBeenCalled();
    });

    it('never REDUCES servedMs (monotonic flush)', () => {
      const persist = vi.fn();
      setPersistCallback(persist);
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      // Entry already has 60s served from a prior pause.
      getPenaltyBoxState().entries[0].servedMs = 60_000;
      // Clock snapshot reports less elapsed than the entry knows (stale).
      scriptSnapshot('penaltyBox-p1', 'running', 100_000); // would suggest 20s served

      pauseAllPenaltyClocks();

      expect(getPenaltyBoxState().entries[0].servedMs).toBe(60_000);
      expect(persist).not.toHaveBeenCalledWith('tie-A', 0, expect.objectContaining({ penaltyServedMs: 20_000 }));
    });
  });

  describe('resumePenaltyClocksForBolt', () => {
    beforeEach(() => {
      sendToBox('male1', 'Male One', 1, { ...baseSendOpts('tie-MS', 0), gender: 'MALE' });
      sendToBox('male2', 'Male Two', 1, { ...baseSendOpts('tie-MS', 1), gender: 'MALE' });
      sendToBox('female1', 'Female One', 2, { ...baseSendOpts('tie-WS', 0), gender: 'FEMALE' });
    });

    it('resumes only players matching the current MS/MD bolt gender', () => {
      scriptSnapshot('penaltyBox-male1', 'paused', 60_000);
      scriptSnapshot('penaltyBox-male2', 'paused', 60_000);
      scriptSnapshot('penaltyBox-female1', 'paused', 60_000);

      resumePenaltyClocksForBolt({ gender: 'MALE', matchUpType: 'SINGLES' });

      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male1');
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male2');
      expect(resumeClock).not.toHaveBeenCalledWith('penaltyBox-female1');
    });

    it('resumes every paused clock on MIXED bolts', () => {
      scriptSnapshot('penaltyBox-male1', 'paused', 60_000);
      scriptSnapshot('penaltyBox-female1', 'paused', 60_000);

      resumePenaltyClocksForBolt({ gender: 'MIXED', matchUpType: 'DOUBLES' });

      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male1');
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-female1');
    });

    it('does not touch running or expired clocks', () => {
      scriptSnapshot('penaltyBox-male1', 'running', 60_000);
      scriptSnapshot('penaltyBox-male2', 'expired', 0);
      scriptSnapshot('penaltyBox-female1', 'paused', 60_000);

      resumePenaltyClocksForBolt({ gender: 'MIXED' });

      expect(resumeClock).toHaveBeenCalledTimes(1);
      expect(resumeClock).toHaveBeenCalledWith('penaltyBox-female1');
    });
  });

  describe('resumeAllPenaltyClocks', () => {
    it('resumes every paused clock regardless of gender (legacy unqualified resume)', () => {
      sendToBox('male1', 'Male One', 1, { ...baseSendOpts('tie-MS', 0), gender: 'MALE' });
      sendToBox('female1', 'Female One', 2, { ...baseSendOpts('tie-WS', 0), gender: 'FEMALE' });
      scriptSnapshot('penaltyBox-male1', 'paused', 60_000);
      scriptSnapshot('penaltyBox-female1', 'paused', 60_000);

      resumeAllPenaltyClocks();

      expect(resumeClock).toHaveBeenCalledTimes(2);
    });
  });

  // ── hydrateFromTeamMatchUp — the projection ─────────────────

  describe('hydrateFromTeamMatchUp', () => {
    const makeTie = (matchUpId: string, points: any[]) => ({
      matchUpId,
      engineState: { history: { points } },
    });
    const makeIncurred = (pid: string, extra: any = {}) => ({
      penaltyEvent: true,
      penaltyAgainstParticipantId: pid,
      penaltyAgainstParticipantName: extra.participantName ?? `Player ${pid}`,
      penaltyAgainstSideNumber: extra.sideNumber ?? 1,
      penaltyAgainstJerseyNumber: extra.jerseyNumber,
      penaltyDurationMs: extra.penaltyDurationMs ?? 120_000,
      penaltyGender: extra.penaltyGender,
      penaltyServedMs: extra.penaltyServedMs,
      penaltyReleasedAt: extra.penaltyReleasedAt,
      timestamp: extra.timestamp ?? '2026-04-16T12:00:00Z',
    });

    it('rebuilds an empty box from an empty team matchUp', () => {
      hydrateFromTeamMatchUp({ tieMatchUps: [] });
      expect(getPenaltyBoxState().entries).toHaveLength(0);
    });

    it('picks up a single open penalty from a single tieMatchUp', () => {
      const team = {
        tieMatchUps: [makeTie('tie-MS', [makeIncurred('p1', { penaltyGender: 'MALE' })])],
      };
      hydrateFromTeamMatchUp(team);

      const entries = getPenaltyBoxState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        participantId: 'p1',
        gender: 'MALE',
        sourceTieMatchUpId: 'tie-MS',
        sourcePointIndex: 0,
        durationMs: 120_000,
        servedMs: 0,
      });
    });

    it('seeds the clock with durationMs − servedMs', () => {
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [makeIncurred('p1', { penaltyServedMs: 45_000 })]),
        ],
      };
      hydrateFromTeamMatchUp(team);

      // setClockRemaining should have been called with (120000 − 45000) = 75000.
      expect(setClockRemaining).toHaveBeenCalledWith('penaltyBox-p1', 75_000);
    });

    it('excludes penalties with penaltyReleasedAt', () => {
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [
            makeIncurred('p1', { penaltyReleasedAt: '2026-04-16T12:02:00Z' }),
          ]),
        ],
      };
      hydrateFromTeamMatchUp(team);
      expect(getPenaltyBoxState().entries).toHaveLength(0);
    });

    it('excludes penalties whose servedMs has reached durationMs', () => {
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [makeIncurred('p1', { penaltyServedMs: 120_000 })]),
        ],
      };
      hydrateFromTeamMatchUp(team);
      expect(getPenaltyBoxState().entries).toHaveLength(0);
    });

    it('unions penalties across multiple tieMatchUps (cross-tie ARC continuity)', () => {
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [
            makeIncurred('male1', { penaltyGender: 'MALE', penaltyServedMs: 20_000 }),
          ]),
          makeTie('tie-WS', [
            makeIncurred('female1', { penaltyGender: 'FEMALE', penaltyServedMs: 10_000, sideNumber: 2 }),
          ]),
        ],
      };
      hydrateFromTeamMatchUp(team);

      const entries = getPenaltyBoxState().entries;
      expect(entries).toHaveLength(2);
      const male = entries.find((e) => e.participantId === 'male1');
      const female = entries.find((e) => e.participantId === 'female1');
      expect(male?.sourceTieMatchUpId).toBe('tie-MS');
      expect(male?.servedMs).toBe(20_000);
      expect(female?.sourceTieMatchUpId).toBe('tie-WS');
      expect(female?.sideNumber).toBe(2);
    });

    it('takes the LATEST incurred entry when a participant appears twice', () => {
      // Player penalised, released, penalised again — most recent open wins.
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [
            makeIncurred('p1', {
              penaltyReleasedAt: '2026-04-16T12:02:00Z',
              timestamp: '2026-04-16T12:00:00Z',
            }),
          ]),
          makeTie('tie-MD', [
            makeIncurred('p1', { timestamp: '2026-04-16T12:30:00Z', penaltyServedMs: 5000 }),
          ]),
        ],
      };
      hydrateFromTeamMatchUp(team);

      const entries = getPenaltyBoxState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].sourceTieMatchUpId).toBe('tie-MD');
      expect(entries[0].servedMs).toBe(5000);
    });

    it('ignores non-penalty points in history', () => {
      const team = {
        tieMatchUps: [
          makeTie('tie-MS', [
            { result: 'Winner', winner: 0, scoreValue: 1 },
            makeIncurred('p1'),
            { result: 'Winner', winner: 1, scoreValue: 1 },
          ]),
        ],
      };
      hydrateFromTeamMatchUp(team);
      expect(getPenaltyBoxState().entries).toHaveLength(1);
      expect(getPenaltyBoxState().entries[0].sourcePointIndex).toBe(1);
    });

    it('is idempotent — hydrating the same document twice gives the same state', () => {
      const team = {
        tieMatchUps: [makeTie('tie-MS', [makeIncurred('p1', { penaltyServedMs: 30_000 })])],
      };
      hydrateFromTeamMatchUp(team);
      const firstSnapshot = JSON.stringify(getPenaltyBoxState().entries);
      hydrateFromTeamMatchUp(team);
      const secondSnapshot = JSON.stringify(getPenaltyBoxState().entries);
      expect(secondSnapshot).toBe(firstSnapshot);
    });

    it('tears down previous clocks when re-hydrating', () => {
      const team1 = { tieMatchUps: [makeTie('tie-MS', [makeIncurred('p1')])] };
      const team2 = { tieMatchUps: [makeTie('tie-WS', [makeIncurred('p2')])] };

      hydrateFromTeamMatchUp(team1);
      expect(isInBox('p1')).toBe(true);
      hydrateFromTeamMatchUp(team2);
      expect(isInBox('p1')).toBe(false);
      expect(isInBox('p2')).toBe(true);
      expect(destroyClock).toHaveBeenCalledWith('penaltyBox-p1');
    });

    it('safe when teamMatchUp is null or undefined', () => {
      expect(() => hydrateFromTeamMatchUp(null)).not.toThrow();
      expect(() => hydrateFromTeamMatchUp(undefined)).not.toThrow();
      expect(getPenaltyBoxState().entries).toHaveLength(0);
    });

    it('skips tieMatchUps without a matchUpId (malformed data)', () => {
      const team = {
        tieMatchUps: [
          { matchUpId: '', engineState: { history: { points: [makeIncurred('p1')] } } },
          makeTie('tie-ok', [makeIncurred('p2')]),
        ],
      };
      hydrateFromTeamMatchUp(team);
      expect(isInBox('p1')).toBe(false);
      expect(isInBox('p2')).toBe(true);
    });
  });

  // ── resetPenaltyBox (test / dev escape hatch) ───────────────

  describe('resetPenaltyBox', () => {
    it('destroys all clocks and clears entries', () => {
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      sendToBox('p2', 'Bob', 2, baseSendOpts('tie-A', 1));
      resetPenaltyBox();
      expect(destroyClock).toHaveBeenCalledTimes(2);
      expect(getPenaltyBoxState().entries).toHaveLength(0);
    });

    it('clears the persist callback too', () => {
      const persist = vi.fn();
      setPersistCallback(persist);
      resetPenaltyBox();
      sendToBox('p1', 'Alice', 1, baseSendOpts());
      scriptSnapshot('penaltyBox-p1', 'running', 100_000);
      pauseAllPenaltyClocks();
      expect(persist).not.toHaveBeenCalled();
    });
  });
});

// Surface the mocked clock symbols used above so TypeScript resolves them.
void createClock;
void destroyClock;
void getClockSnapshot;
void pauseClock;
void resumeClock;
void setClockRemaining;
