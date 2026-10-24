import { createTrustedCrowdFanout, crowdSessionToScoreUpdate } from './trustedFanout.js';
import { getMatch, removeMatch, updateMatch } from '../matchUpStore.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrowdScoringSession } from './types.js';
import type { Namespace } from 'socket.io';

const SETS = [{ setNumber: 1, side1Score: 3, side2Score: 2 }];

function session(overrides: Partial<CrowdScoringSession> = {}): CrowdScoringSession {
  return {
    sessionId: 's-1',
    matchUpId: 'mu-1',
    tournamentId: 't-1',
    userId: 'provider-ionsport',
    clientId: 'ionsport-app',
    formatHint: 'SET3-S:6/TB7',
    currentScore: { sets: SETS },
    pointHistory: [],
    trusted: true,
    status: 'active',
    version: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CrowdScoringSession;
}

/** A /live namespace that records `to(room).emit(event, payload)`. */
function fakeListeners() {
  const emitted: { room: string; event: string; payload: any }[] = [];
  const listeners = {
    to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }),
  } as unknown as Namespace;
  return { listeners, emitted };
}

afterEach(() => {
  removeMatch('mu-1');
});

describe('crowdSessionToScoreUpdate', () => {
  it('builds a /live score frame for a promoted, active session, stamped as crowd', () => {
    expect(crowdSessionToScoreUpdate(session())).toEqual({
      matchUpId: 'mu-1',
      tournamentId: 't-1',
      matchUpFormat: 'SET3-S:6/TB7',
      score: { sets: SETS },
      matchUpStatus: 'IN_PROGRESS',
      source: 'crowd',
      sessionId: 's-1',
    });
  });

  it('carries a finished session as COMPLETED with its winner', () => {
    const update = crowdSessionToScoreUpdate(session({ currentScore: { sets: SETS, winningSide: 1 } }));
    expect(update?.matchUpStatus).toBe('COMPLETED');
    expect(update?.winningSide).toBe(1);
  });

  it('publishes nothing for an unpromoted, ended or scoreless session', () => {
    expect(crowdSessionToScoreUpdate(session({ trusted: false }))).toBeUndefined();
    expect(crowdSessionToScoreUpdate(session({ status: 'cancelled-by-user' }))).toBeUndefined();
    expect(crowdSessionToScoreUpdate(session({ currentScore: {} as any }))).toBeUndefined();
  });
});

describe('createTrustedCrowdFanout', () => {
  it('publishes to the match, tournament and all rooms and records it for replay', () => {
    const { listeners, emitted } = fakeListeners();
    createTrustedCrowdFanout(listeners).publish(session());
    expect(emitted.map((e) => e.room)).toEqual(['mu-1', 'tournament:t-1', 'all']);
    expect(emitted.every((e) => e.event === 'score' && e.payload.source === 'crowd')).toBe(true);
    expect(getMatch('mu-1')?.lastUpdate.sessionId).toBe('s-1');
  });

  it('does not publish an unpromoted session', () => {
    const { listeners, emitted } = fakeListeners();
    createTrustedCrowdFanout(listeners).publish(session({ trusted: false }));
    expect(emitted).toHaveLength(0);
    expect(getMatch('mu-1')).toBeUndefined();
  });

  it('retract forgets the frame this session produced', () => {
    const { listeners } = fakeListeners();
    const fanout = createTrustedCrowdFanout(listeners);
    fanout.publish(session());
    fanout.retract({ sessionId: 's-1', matchUpId: 'mu-1' });
    expect(getMatch('mu-1')).toBeUndefined();
  });

  it("retract leaves a tracker's frame — and another session's — in place", () => {
    const { listeners } = fakeListeners();
    const fanout = createTrustedCrowdFanout(listeners);
    updateMatch({ matchUpId: 'mu-1', tournamentId: 't-1', score: { sets: SETS }, source: 'tracker' });
    fanout.retract({ sessionId: 's-1', matchUpId: 'mu-1' });
    expect(getMatch('mu-1')?.lastUpdate.source).toBe('tracker');

    fanout.publish(session({ sessionId: 's-2' }));
    fanout.retract({ sessionId: 's-1', matchUpId: 'mu-1' });
    expect(getMatch('mu-1')?.lastUpdate.sessionId).toBe('s-2');
  });

  it('contains a broadcast failure — callers run it after a point is acked or a promote is saved', () => {
    const listeners = {
      to: () => ({
        emit: () => {
          throw new Error('boom');
        },
      }),
    } as unknown as Namespace;
    const logger = vi.fn();
    expect(() => createTrustedCrowdFanout(listeners, logger).publish(session())).not.toThrow();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
