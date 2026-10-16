import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreGovernor } from 'tods-competition-factory';

// What reaches the tracker socket when the scorer's point array changes. The
// relay appends a `point` and replaces the stored history on `correctPoints`,
// so an undo or an edit must arrive as a correction, never as a silent no-op.
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    emit,
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    active: true,
    io: { on: vi.fn() },
  })),
}));
vi.mock('../../../state/browserStorage', () => ({ browserStorage: { get: () => undefined } }));

import { disconnectAll, sendScore, syncPoints } from '../scoreRelay';

const { ScoringEngine } = scoreGovernor;

const frames = (event: string) => emit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);

let matchCounter = 0;
let matchUpId: string;

function broadcast(points: any[]): void {
  sendScore({ matchUpId, tournamentId: 't-1', score: {}, point: points[points.length - 1], points });
}

beforeEach(() => {
  disconnectAll();
  emit.mockClear();
  matchUpId = `m-${++matchCounter}`;
});

describe('sendScore with the full point array', () => {
  it('sends each new point once and nothing for a re-broadcast', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    broadcast(engine.getState().history.points);
    broadcast(engine.getState().history.points); // a timeout or a substitution
    engine.addPoint({ winner: 1 });
    broadcast(engine.getState().history.points);

    expect(frames('score').map((frame) => frame.point?.pointNumber)).toEqual([1, undefined, 2]);
    expect(frames('correctPoints')).toHaveLength(0);
  });

  it('sends the whole array after an undo and a re-score with the other winner', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    broadcast(engine.getState().history.points);
    engine.undo();
    engine.addPoint({ winner: 1 }); // same pointNumber, other winner
    broadcast(engine.getState().history.points);

    const [correction] = frames('correctPoints');
    expect(correction.matchUpId).toBe(matchUpId);
    expect(correction.points.map((point: any) => point.winner)).toEqual([0, 1]);
    expect(frames('score')[1].point).toBeUndefined();
  });

  it('sends the whole array after an undo alone, then appends again', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 1, 0] as const) engine.addPoint({ winner });
    broadcast(engine.getState().history.points);
    engine.undo();
    broadcast(engine.getState().history.points);
    engine.addPoint({ winner: 1 });
    broadcast(engine.getState().history.points);

    expect(frames('correctPoints').map((frame) => frame.points.length)).toEqual([2]);
    expect(frames('score').map((frame) => frame.point?.pointNumber)).toEqual([3, undefined, 3]);
  });

  it('sends the whole array when an earlier point is edited and the last is unchanged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 0, 0] as const) engine.addPoint({ winner });
    broadcast(engine.getState().history.points);
    engine.editPoint(0, { result: 'Ace' });
    broadcast(engine.getState().history.points);

    const [correction] = frames('correctPoints');
    expect(correction.points[0].result).toBe('Ace');
    expect(correction.points).toHaveLength(3);
  });

  it('takes the first array of a page session as its baseline', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 1, 1] as const) engine.addPoint({ winner });
    broadcast(engine.getState().history.points); // a resumed match

    expect(frames('score')[0].point.pointNumber).toBe(3);
    expect(frames('correctPoints')).toHaveLength(0);
  });

  it('corrects to an empty history when every point is undone', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    broadcast(engine.getState().history.points);
    engine.undo();
    syncPoints({ matchUpId, tournamentId: 't-1', points: engine.getState().history?.points ?? [] });

    expect(frames('correctPoints')).toEqual([{ matchUpId, tournamentId: 't-1', matchUpFormat: undefined, points: [] }]);
  });

  it('keeps the frame free of the array itself', () => {
    broadcast([{ pointNumber: 1, winner: 0 }]);
    expect(frames('score')[0]).not.toHaveProperty('points');
  });
});
