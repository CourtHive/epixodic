import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for the "bolt clock paused ⇒ penalty clock paused"
 * contract, plus the end-to-end event-sourced projection across
 * tieMatchUps within an ARC.
 *
 *   startBreakClock()      → pauseAllPenaltyClocks + persist servedMs
 *   handleNextBolt()       → resumePenaltyClocksForBolt(...)
 *   handleTimeout()        → pauseAllPenaltyClocks + persist servedMs
 *   handleDismissTimeout() → resumePenaltyClocksForBolt(...)
 *   handleCancelTimeout()  → resumePenaltyClocksForBolt(...)
 *
 * ARC navigation: a PENALTY_INCURRED in MS persists servedMs into its
 * point via the persist callback; mounting MD calls
 * hydrateFromTeamMatchUp(team), which rebuilds the box from the cross-
 * tieMatchUp history union.
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
  sendToBox,
  releaseFromBox,
  resetPenaltyBox,
  pauseAllPenaltyClocks,
  resumeAllPenaltyClocks,
  resumePenaltyClocksForBolt,
  hydrateFromTeamMatchUp,
  setPersistCallback,
  getBoxedPlayers,
  getPenaltyBoxState,
} from '../penaltyBox.svelte';
import { getClockSnapshot, pauseClock, resumeClock } from '../../../clock';

function scriptSnapshot(id: string, state: 'running' | 'paused' | 'expired' | 'idle', remainingMs = 0) {
  mockStates[id] = { state, remainingMs };
}

describe('break-flow integration — penalty clocks pause across the break', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  it('freezes an active penalty timer for the duration of a break', () => {
    sendToBox('p1', 'Alice', 1, {
      sourceTieMatchUpId: 'tie-MS',
      sourcePointIndex: 0,
      autoStart: true,
    });
    scriptSnapshot('penaltyBox-p1', 'running', 90_000);

    pauseAllPenaltyClocks();
    expect(pauseClock).toHaveBeenCalledWith('penaltyBox-p1');
    expect(getClockSnapshot('penaltyBox-p1')?.state).toBe('paused');

    scriptSnapshot('penaltyBox-p1', 'paused', 90_000);
    resumeAllPenaltyClocks();
    expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
  });

  it('flushes servedMs to history on every pause (persist callback)', () => {
    const persist = vi.fn();
    setPersistCallback(persist);
    sendToBox('p1', 'Alice', 1, {
      sourceTieMatchUpId: 'tie-MS',
      sourcePointIndex: 4,
      autoStart: true,
    });
    scriptSnapshot('penaltyBox-p1', 'running', 90_000); // 30s served

    pauseAllPenaltyClocks();

    expect(persist).toHaveBeenCalledWith('tie-MS', 4, { penaltyServedMs: 30_000 });
  });

  it('releasing a player mid-break clears the entry and its clock', () => {
    sendToBox('p1', 'Alice', 1, { sourceTieMatchUpId: 'tie-MS', sourcePointIndex: 0 });
    pauseAllPenaltyClocks();
    releaseFromBox('p1');
    expect(getClockSnapshot('penaltyBox-p1')).toBeUndefined();
    expect(getBoxedPlayers()).toHaveLength(0);
  });
});

describe('timeout-flow integration — penalty clocks pause across the timeout', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  it('timeout pause + dismiss flushes servedMs and resumes', () => {
    const persist = vi.fn();
    setPersistCallback(persist);
    sendToBox('p1', 'Alice', 1, {
      sourceTieMatchUpId: 'tie-MS',
      sourcePointIndex: 0,
      gender: 'MALE',
      autoStart: true,
    });
    scriptSnapshot('penaltyBox-p1', 'running', 100_000);

    pauseAllPenaltyClocks();
    expect(persist).toHaveBeenCalledWith('tie-MS', 0, { penaltyServedMs: 20_000 });

    scriptSnapshot('penaltyBox-p1', 'paused', 100_000);
    resumePenaltyClocksForBolt({ gender: 'MALE' });
    expect(resumeClock).toHaveBeenCalledWith('penaltyBox-p1');
  });

  it('a timeout-then-break sequence flushes servedMs twice without double-counting', () => {
    const persist = vi.fn();
    setPersistCallback(persist);
    sendToBox('p1', 'Alice', 1, {
      sourceTieMatchUpId: 'tie-MS',
      sourcePointIndex: 0,
      autoStart: true,
    });

    // First interval — 30s served.
    scriptSnapshot('penaltyBox-p1', 'running', 90_000);
    pauseAllPenaltyClocks();
    expect(persist).toHaveBeenLastCalledWith('tie-MS', 0, { penaltyServedMs: 30_000 });

    // Resume and tick another 20s → 50s total served.
    scriptSnapshot('penaltyBox-p1', 'paused', 90_000);
    resumeAllPenaltyClocks();
    scriptSnapshot('penaltyBox-p1', 'running', 70_000);
    pauseAllPenaltyClocks();
    expect(persist).toHaveBeenLastCalledWith('tie-MS', 0, { penaltyServedMs: 50_000 });
  });
});

describe('cross-tieMatchUp penalty persistence (ARC-scoped projection)', () => {
  // Commissioner scenario: male player penalised in the final second of
  // MS → box time resumes at the start of MD. WS bolts in between keep
  // the male's clock paused because he's gender-ineligible.

  beforeEach(() => {
    for (const k of Object.keys(mockStates)) delete mockStates[k];
    resetPenaltyBox();
    vi.clearAllMocks();
  });

  const makeTie = (matchUpId: string, points: any[]) => ({
    matchUpId,
    engineState: { history: { points } },
  });
  const incurred = (pid: string, extra: any = {}) => ({
    penaltyEvent: true,
    penaltyAgainstParticipantId: pid,
    penaltyAgainstParticipantName: extra.participantName ?? pid,
    penaltyAgainstSideNumber: extra.sideNumber ?? 1,
    penaltyDurationMs: extra.penaltyDurationMs ?? 120_000,
    penaltyGender: extra.penaltyGender,
    penaltyServedMs: extra.penaltyServedMs,
    penaltyReleasedAt: extra.penaltyReleasedAt,
    timestamp: extra.timestamp ?? '2026-04-16T12:00:00Z',
  });

  it('hydrating MD from a history containing an open MS penalty rebuilds the box', () => {
    const team = {
      tieMatchUps: [
        makeTie('tie-MS', [incurred('male-1', { penaltyGender: 'MALE', penaltyServedMs: 1000 })]),
        makeTie('tie-MD', []),
      ],
    };
    hydrateFromTeamMatchUp(team);

    const boxed = getBoxedPlayers();
    expect(boxed).toHaveLength(1);
    expect(boxed[0].participantId).toBe('male-1');
    // Clock seeded to 120000 − 1000 = 119000.
    expect(boxed[0].remainingMs).toBe(119_000);
  });

  it('WS bolt leaves a male-flagged entry paused; MD resumes it', () => {
    const team = {
      tieMatchUps: [
        makeTie('tie-MS', [incurred('male-1', { penaltyGender: 'MALE', penaltyServedMs: 30_000 })]),
      ],
    };
    hydrateFromTeamMatchUp(team);

    // Clock starts idle — setClockRemaining seeded it to 90s remaining.
    // WS bolt begins — resume for FEMALE. Male stays idle/paused.
    mockStates['penaltyBox-male-1'] = { state: 'paused', remainingMs: 90_000 };
    resumePenaltyClocksForBolt({ gender: 'FEMALE' });
    expect(resumeClock).not.toHaveBeenCalled();
    expect(getClockSnapshot('penaltyBox-male-1')?.state).toBe('paused');

    // MD bolt begins.
    resumePenaltyClocksForBolt({ gender: 'MALE' });
    expect(resumeClock).toHaveBeenCalledWith('penaltyBox-male-1');
  });

  it('a released penalty in an earlier tie does not re-appear in the box', () => {
    const team = {
      tieMatchUps: [
        makeTie('tie-MS', [
          incurred('male-1', {
            penaltyGender: 'MALE',
            penaltyServedMs: 120_000,
            penaltyReleasedAt: '2026-04-16T12:02:00Z',
          }),
        ]),
        makeTie('tie-MD', []),
      ],
    };
    hydrateFromTeamMatchUp(team);
    expect(getBoxedPlayers()).toHaveLength(0);
  });

  it('hydrate → pause → persist ends up with consistent servedMs on the source tie', () => {
    const msTie = makeTie('tie-MS', [
      incurred('male-1', { penaltyGender: 'MALE', penaltyServedMs: 30_000 }),
    ]);
    const team = { tieMatchUps: [msTie] };

    // Simulate the component: hydrate, then register a persist callback
    // that mutates the history directly (which is what the prior-tie
    // path does in BoltScoringPage).
    hydrateFromTeamMatchUp(team);
    setPersistCallback((tieId, pointIndex, metadata) => {
      const tie = team.tieMatchUps.find((t: any) => t.matchUpId === tieId) as any;
      const point = tie?.engineState?.history?.points?.[pointIndex];
      if (point) Object.assign(point, metadata);
    });

    // Simulate the next bolt running the clock down another 20s.
    mockStates['penaltyBox-male-1'] = { state: 'running', remainingMs: 70_000 };
    pauseAllPenaltyClocks();

    // The source MS tie's history now reflects 50s served total.
    expect((msTie.engineState.history.points[0] as any).penaltyServedMs).toBe(50_000);
  });

  it('the box is EMPTY after tearing down to an empty team matchUp (leaving the ARC)', () => {
    const team = {
      tieMatchUps: [makeTie('tie-MS', [incurred('male-1', { penaltyServedMs: 10_000 })])],
    };
    hydrateFromTeamMatchUp(team);
    expect(getBoxedPlayers()).toHaveLength(1);

    hydrateFromTeamMatchUp({ tieMatchUps: [] });
    expect(getBoxedPlayers()).toHaveLength(0);
    expect(getPenaltyBoxState().entries).toHaveLength(0);
  });

  it('hydration replaces any previously-projected entries (no leaks across ARCs)', () => {
    const arcA = { tieMatchUps: [makeTie('tie-MS', [incurred('male-arc-A')])] };
    const arcB = { tieMatchUps: [makeTie('tie-WS', [incurred('female-arc-B', { penaltyGender: 'FEMALE' })])] };

    hydrateFromTeamMatchUp(arcA);
    expect(getBoxedPlayers().map((p) => p.participantId)).toEqual(['male-arc-A']);

    hydrateFromTeamMatchUp(arcB);
    expect(getBoxedPlayers().map((p) => p.participantId)).toEqual(['female-arc-B']);
  });
});
