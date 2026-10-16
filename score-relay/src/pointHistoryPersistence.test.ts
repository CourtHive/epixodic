import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  configurePointHistoryPersistence,
  isPointHistoryPersistenceEnabled,
  persistCrowdPromotedPoints,
  persistPoint,
  toStoredPoint,
} from './pointHistoryPersistence.js';
import type { ScoreUpdate } from './types.js';

vi.mock('axios', () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));

const mockedPost = vi.mocked(axios.post);
const mockedPut = vi.mocked(axios.put);

function update(overrides: Partial<ScoreUpdate> = {}): ScoreUpdate {
  return {
    matchUpId: 'mu-1',
    tournamentId: 't-1',
    score: {},
    point: { winner: 0, server: 1 },
    ...overrides,
  };
}

describe('toStoredPoint', () => {
  it('derives winningSide/serverSideNumber from legacy 0-indexed winner/server', () => {
    const point = toStoredPoint(update({ point: { winner: 0, server: 1, result: 'ace' } }));
    expect(point).toMatchObject({ winningSide: 1, serverSideNumber: 2, result: 'ace' });
  });

  it('prefers CODES-aligned fields and carries serverParticipantId (doubles) + decorations', () => {
    const point = toStoredPoint(
      update({
        point: {
          winner: 0, // legacy present but should be overridden by winningSide
          winningSide: 2,
          serverSideNumber: 1,
          serverParticipantId: 'p-9',
          pointNumber: 7,
          rallyLength: 5,
        },
      }),
    );
    expect(point).toEqual({
      pointNumber: 7,
      winningSide: 2,
      serverSideNumber: 1,
      serverParticipantId: 'p-9',
      rallyLength: 5,
    });
  });

  it('returns null when the event carries no point', () => {
    expect(toStoredPoint(update({ point: undefined }))).toBeNull();
  });
});

describe('persistPoint', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ data: {} } as any);
  });
  afterEach(() => {
    configurePointHistoryPersistence(undefined, undefined);
  });

  it('is a no-op (no HTTP) when disabled', async () => {
    configurePointHistoryPersistence(undefined, undefined);
    expect(isPointHistoryPersistenceEnabled()).toBe(false);
    await persistPoint(update());
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('POSTs to the ingest URL with the bearer token and mapped point', async () => {
    configurePointHistoryPersistence('http://localhost:3150/', 'svc-jwt');
    await persistPoint(update({ matchUpFormat: 'SET3', point: { winner: 1, server: 0 } }));

    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body, cfg] = mockedPost.mock.calls[0];
    expect(url).toBe('http://localhost:3150/match-up-point-history/mu-1/points');
    expect(body).toEqual({ tournamentId: 't-1', matchUpFormat: 'SET3', point: { winningSide: 2, serverSideNumber: 1 } });
    expect((cfg as any).headers.Authorization).toBe('Bearer svc-jwt');
  });

  it('skips when tournamentId is absent (the store requires it)', async () => {
    configurePointHistoryPersistence('http://localhost:3150', 'svc-jwt');
    await persistPoint(update({ tournamentId: undefined }));
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('never throws when the POST fails after retries', async () => {
    configurePointHistoryPersistence('http://localhost:3150', undefined);
    mockedPost.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));
    await expect(persistPoint(update())).resolves.toBeUndefined();
    expect(mockedPost).toHaveBeenCalledTimes(3);
  });

  it('sends a timeout so a hung request cannot hold the match queue forever', async () => {
    configurePointHistoryPersistence('http://localhost:3150', undefined);
    await persistPoint(update());
    expect((mockedPost.mock.calls[0][2] as any).timeout).toBeGreaterThan(0);
  });

  // courthive-query drops an append whose pointNumber is not above the last stored
  // one, so point 1 landing after point 2 is discarded as a duplicate.
  it('commits the points of one match in the order they were scored', async () => {
    configurePointHistoryPersistence('http://localhost:3150', undefined);
    const committed: number[] = [];
    let releaseFirst!: () => void;
    mockedPost.mockImplementationOnce(
      (_url, body: any) =>
        new Promise((resolve) => {
          releaseFirst = () => {
            committed.push(body.point.pointNumber);
            resolve({ data: {} } as any);
          };
        }),
    );
    mockedPost.mockImplementation(async (_url, body: any) => {
      committed.push(body.point.pointNumber);
      return { data: {} } as any;
    });

    const first = persistPoint(update({ point: { winner: 0, pointNumber: 1 } }));
    const second = persistPoint(update({ point: { winner: 1, pointNumber: 2 } }));
    const otherMatch = persistPoint(update({ matchUpId: 'mu-2', point: { winner: 1, pointNumber: 1 } }));
    await otherMatch;
    await new Promise((r) => setTimeout(r, 10));
    releaseFirst();
    await Promise.all([first, second]);

    // mu-2 is independent and does not wait; mu-1's point 2 waits for point 1.
    expect(committed).toEqual([1, 1, 2]);
  });
});

describe('persistCrowdPromotedPoints (S6)', () => {
  const session = (over: any = {}): any => ({
    matchUpId: 'mu-c',
    tournamentId: 't-c',
    matchUpFormat: 'SET3',
    pointHistory: [
      { winner: 1, server: 2, result: 'ace', recordedAt: '2026-07-27T00:00:00Z' },
      { winner: 2 },
    ],
    ...over,
  });

  beforeEach(() => {
    mockedPut.mockReset();
    mockedPut.mockResolvedValue({ data: { version: 1 } } as any);
  });
  afterEach(() => configurePointHistoryPersistence(undefined, undefined));

  it('PUTs crowd-mapped points with provenance crowd-promoted', async () => {
    configurePointHistoryPersistence('http://localhost:3150', 'svc');
    await persistCrowdPromotedPoints(session());

    expect(mockedPut).toHaveBeenCalledTimes(1);
    const [url, body, cfg] = mockedPut.mock.calls[0];
    expect(url).toBe('http://localhost:3150/match-up-point-history/mu-c/points');
    expect(body.provenance).toBe('crowd-promoted');
    // CrowdPoint side numbers map straight through (no 0-index shift) + pointNumber.
    expect(body.points[0]).toEqual({
      pointNumber: 1,
      winningSide: 1,
      serverSideNumber: 2,
      result: 'ace',
      timestamp: '2026-07-27T00:00:00Z',
    });
    expect(body.points[1]).toEqual({ pointNumber: 2, winningSide: 2 });
    expect((cfg as any).headers.Authorization).toBe('Bearer svc');
  });

  it('no-ops when disabled or the session has no points', async () => {
    configurePointHistoryPersistence(undefined, undefined);
    await persistCrowdPromotedPoints(session());
    expect(mockedPut).not.toHaveBeenCalled();

    configurePointHistoryPersistence('http://localhost:3150', 'svc');
    await persistCrowdPromotedPoints(session({ pointHistory: [] }));
    expect(mockedPut).not.toHaveBeenCalled();
  });
});
