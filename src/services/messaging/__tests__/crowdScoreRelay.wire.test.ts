import { beforeEach, describe, expect, it, vi } from 'vitest';

// Composed: the real bridge and the real /crowd producer, down to the frame put
// on the socket, checked by the relay's own submit validator. The unit tests of
// each piece passed while every frame from this path was `invalid-payload`.
const { emit, identity } = vi.hoisted(() => ({
  emit: vi.fn(),
  identity: { current: null as any },
}));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ emit, on: vi.fn(), disconnect: vi.fn() })),
}));
vi.mock('../crowdScorerIdentity', () => ({ getCrowdScorerIdentity: () => identity.current }));

import { isValidSubmitPayload } from '../../../../score-relay/src/crowd/submitPayload';
import { relayCrowdScoreIfLaunched, toCrowdPoint } from '../crowdScoreRelay';

function submitted(): any[] {
  return emit.mock.calls.filter(([event]) => event === 'submitCrowdScore').map(([, payload]) => payload);
}

// The engine's point: 0-based winner/server (factory scoring `Point`).
function enginePoint(pointNumber: number, winner: 0 | 1, server: 0 | 1 = 0): any {
  return { pointNumber, winner, server, timestamp: '2026-10-16T12:00:00.000Z', result: 'Winner' };
}

function relay(point?: any, matchUpId = 'm-wire'): void {
  relayCrowdScoreIfLaunched({ matchUpId, tournamentId: 't-1', currentScore: { sets: [] }, point });
}

describe('epixodic → /crowd wire', () => {
  beforeEach(() => {
    emit.mockClear();
    identity.current = { token: 'hiveid-token', personId: 'person-1', displayName: 'Scorer', verified: true };
  });

  it('sends a frame the relay accepts, for a point won by either side', () => {
    relay(enginePoint(1, 0), 'm-sides');
    relay(enginePoint(2, 1), 'm-sides');
    const frames = submitted();
    expect(frames).toHaveLength(2);
    for (const frame of frames) expect(isValidSubmitPayload(frame)).toBe(true);
    expect(frames.map((frame) => frame.point.winner)).toEqual([1, 2]);
  });

  it('maps the engine point onto CrowdPoint side numbers', () => {
    expect(toCrowdPoint(enginePoint(3, 1, 1))).toEqual({
      winner: 2,
      server: 2,
      result: 'Winner',
      recordedAt: '2026-10-16T12:00:00.000Z',
    });
    expect(toCrowdPoint({ pointNumber: 1, winner: 0 })?.recordedAt).toEqual(expect.any(String));
    expect(toCrowdPoint({ pointNumber: 1 })).toBeUndefined();
  });

  it('sends nothing for a transition that adds no point', () => {
    relay(enginePoint(1, 0), 'm-repeat');
    relay(enginePoint(1, 0), 'm-repeat'); // re-broadcast after a timeout or substitution
    relay(undefined, 'm-repeat');
    expect(submitted()).toHaveLength(1);
  });
});
