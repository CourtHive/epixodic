import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client so connectTracker() builds a fake connected socket and
// sendScore emits into our spy. (House pattern: vi.hoisted + vi.mock of the lib.)
const { emit, ioMock } = vi.hoisted(() => {
  const emit = vi.fn();
  const socket = { connected: true, emit, on: vi.fn(), io: { on: vi.fn() } };
  return { emit, ioMock: vi.fn(() => socket) };
});
vi.mock('socket.io-client', () => ({ io: ioMock }));

import { sendScore } from '../scoreRelay';

function scoreEmits(): any[] {
  return emit.mock.calls.filter(([event]) => event === 'score').map(([, payload]) => payload);
}

describe('sendScore — point dedup (S5b)', () => {
  beforeEach(() => emit.mockClear());

  it('forwards a new point once and strips it on re-broadcast of the same pointNumber', () => {
    sendScore({ matchUpId: 'mu-1', tournamentId: 't', score: {}, point: { pointNumber: 1, winningSide: 1 } });
    sendScore({ matchUpId: 'mu-1', tournamentId: 't', score: {}, point: { pointNumber: 1, winningSide: 1 } });
    sendScore({ matchUpId: 'mu-1', tournamentId: 't', score: {}, point: { pointNumber: 2, winningSide: 2 } });

    const emits = scoreEmits();
    expect(emits[0].point).toEqual({ pointNumber: 1, winningSide: 1 });
    expect(emits[1].point).toBeUndefined(); // duplicate pointNumber → stripped
    expect(emits[2].point).toEqual({ pointNumber: 2, winningSide: 2 });
  });

  it('dedups per matchUp independently', () => {
    sendScore({ matchUpId: 'mu-a', tournamentId: 't', score: {}, point: { pointNumber: 1 } });
    sendScore({ matchUpId: 'mu-b', tournamentId: 't', score: {}, point: { pointNumber: 1 } });
    const emits = scoreEmits();
    expect(emits[0].point).toEqual({ pointNumber: 1 });
    expect(emits[1].point).toEqual({ pointNumber: 1 }); // different matchUp → not deduped
  });

  it('strips a point that has no pointNumber (cannot be deduped)', () => {
    sendScore({ matchUpId: 'mu-2', tournamentId: 't', score: {}, point: { winningSide: 1 } });
    expect(scoreEmits()[0].point).toBeUndefined();
  });

  it('always emits the score frame even when the point is stripped', () => {
    sendScore({ matchUpId: 'mu-3', tournamentId: 't', score: { sets: [] }, point: { winningSide: 2 } });
    const emitted = scoreEmits()[0];
    expect(emitted.matchUpId).toBe('mu-3');
    expect(emitted.score).toEqual({ sets: [] });
    expect(emitted.point).toBeUndefined();
  });

  it('leaves a point-less score frame untouched', () => {
    sendScore({ matchUpId: 'mu-4', tournamentId: 't', score: {}, matchUpStatus: 'IN_PROGRESS' });
    expect(scoreEmits()[0]).toMatchObject({ matchUpId: 'mu-4', matchUpStatus: 'IN_PROGRESS' });
  });
});
