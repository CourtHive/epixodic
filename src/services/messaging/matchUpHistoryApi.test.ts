import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock axios so create() returns one shared fake instance (house pattern 2), plus
// the auth deps used at module load.
const { fakeInstance } = vi.hoisted(() => ({
  fakeInstance: {
    interceptors: { request: { use: vi.fn() } },
    put: vi.fn(),
    get: vi.fn(),
  } as any,
}));
vi.mock('axios', () => ({ default: { create: () => fakeInstance }, create: () => fakeInstance }));
vi.mock('../../config/getJwtTokenStorageKey', () => ({ getJwtTokenStorageKey: () => 'tmxToken' }));
vi.mock('../../state/browserStorage', () => ({ browserStorage: { get: () => 'tok' } }));

import {
  __resetMatchUpHistoryApiForTests,
  fetchBoltHistory,
  fetchParentMatchUp,
  flushOfflineQueue,
  getKnownVersion,
  getOfflineQueueDepth,
  hydrateBoltHistoryOnMount,
  pushBoltHistory,
} from './matchUpHistoryApi';

const doc = (over: any = {}) =>
  ({
    tieMatchUpId: 'tie-1',
    parentMatchUpId: 'team-1',
    tournamentId: 't-1',
    engineState: { score: {} },
    updatedAt: '2026-07-27T00:00:00.000Z',
    version: 0,
    ...over,
  }) as any;

beforeEach(() => __resetMatchUpHistoryApiForTests());
afterEach(() => {
  fakeInstance.put.mockReset();
  fakeInstance.get.mockReset();
});

describe('pushBoltHistory', () => {
  it('PUTs the envelope to /state and caches the returned version', async () => {
    fakeInstance.put.mockResolvedValue({ data: { version: 4 } });
    const res = await pushBoltHistory(doc());
    expect(res).toEqual({ success: true, version: 4 });
    const [url, body] = fakeInstance.put.mock.calls[0];
    expect(url).toBe('/match-up-point-history/tie-1/state');
    expect(body.tournamentId).toBe('t-1');
    expect(body.runtimeState.engineState).toEqual({ score: {} }); // whole doc is the envelope
    expect(getKnownVersion('tie-1')).toBe(4);
  });

  it('queues offline on network error', async () => {
    fakeInstance.put.mockRejectedValue(new Error('offline'));
    const res = await pushBoltHistory(doc());
    expect(res.error).toBe('offline');
    expect(getOfflineQueueDepth()).toBe(1);
  });
});

describe('fetchBoltHistory', () => {
  it('reconstructs the document from runtimeState + row version', async () => {
    fakeInstance.get.mockResolvedValue({
      data: { document: { runtimeState: doc({ boltComplete: true }), version: 7 } },
    });
    const res = await fetchBoltHistory('tie-1');
    expect(res.document?.boltComplete).toBe(true);
    expect(res.document?.version).toBe(7); // row version overrides envelope's
    expect(getKnownVersion('tie-1')).toBe(7);
  });

  it('returns not_found when the row has no envelope yet (points-only)', async () => {
    fakeInstance.get.mockResolvedValue({ data: { document: { runtimeState: null, version: 2 } } });
    expect(await fetchBoltHistory('tie-1')).toEqual({ error: 'not_found' });
  });

  it('maps a 404 to not_found', async () => {
    fakeInstance.get.mockRejectedValue({ response: { status: 404 } });
    expect(await fetchBoltHistory('tie-1')).toEqual({ error: 'not_found' });
  });
});

describe('hydrateBoltHistoryOnMount', () => {
  it('adopts the server envelope when it is newer', async () => {
    fakeInstance.get.mockResolvedValue({
      data: { document: { runtimeState: doc({ updatedAt: '2026-07-27T02:00:00.000Z' }), version: 3 } },
    });
    const res = await hydrateBoltHistoryOnMount('tie-1', '2026-07-27T01:00:00.000Z');
    expect(res.source).toBe('server');
  });

  it('keeps local when local is newer', async () => {
    fakeInstance.get.mockResolvedValue({
      data: { document: { runtimeState: doc({ updatedAt: '2026-07-27T00:00:00.000Z' }), version: 3 } },
    });
    const res = await hydrateBoltHistoryOnMount('tie-1', '2026-07-27T05:00:00.000Z');
    expect(res.source).toBe('local');
  });

  it('takes the server on a fresh device (no local)', async () => {
    fakeInstance.get.mockResolvedValue({ data: { document: { runtimeState: doc(), version: 1 } } });
    expect((await hydrateBoltHistoryOnMount('tie-1')).source).toBe('server');
  });

  it('falls back to fresh/local when the server has nothing', async () => {
    fakeInstance.get.mockRejectedValue({ response: { status: 404 } });
    expect((await hydrateBoltHistoryOnMount('tie-1')).source).toBe('fresh');
    expect((await hydrateBoltHistoryOnMount('tie-1', '2026-07-27T00:00:00.000Z')).source).toBe('local');
  });
});

describe('fetchParentMatchUp', () => {
  it('returns the team matchUp embedded in the envelope', async () => {
    const teamMatchUp = { matchUpId: 'team-1', tieMatchUps: [] };
    fakeInstance.get.mockResolvedValue({ data: { document: { runtimeState: doc({ teamMatchUp }), version: 1 } } });
    expect(await fetchParentMatchUp('tie-1')).toEqual({ teamMatchUp });
  });

  it('returns not_found when the envelope has no team context', async () => {
    fakeInstance.get.mockResolvedValue({ data: { document: { runtimeState: doc(), version: 1 } } });
    expect(await fetchParentMatchUp('tie-1')).toEqual({ error: 'not_found' });
  });
});

// The order of envelopes the server received, by their `marker`.
function sentMarkers(): string[] {
  return fakeInstance.put.mock.calls.map(([, body]: any[]) => body.runtimeState.marker);
}

function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('save pipeline ordering', () => {
  it('never replays an older queued snapshot after a newer save succeeds', async () => {
    fakeInstance.put.mockRejectedValueOnce(new Error('offline'));
    fakeInstance.put.mockResolvedValue({ data: { version: 2 } });

    await pushBoltHistory(doc({ marker: 'OLD' }));
    await pushBoltHistory(doc({ marker: 'NEW' }));
    await flushOfflineQueue();

    expect(sentMarkers()).toEqual(['OLD', 'NEW']);
    expect(getOfflineQueueDepth()).toBe(0);
  });

  it('sends one save per match at a time and skips to the latest snapshot', async () => {
    const first = deferred();
    fakeInstance.put.mockReturnValueOnce(first.promise);
    fakeInstance.put.mockResolvedValue({ data: { version: 5 } });

    const a = pushBoltHistory(doc({ marker: 'A' }));
    const b = pushBoltHistory(doc({ marker: 'B' }));
    const c = pushBoltHistory(doc({ marker: 'C' }));
    expect(sentMarkers()).toEqual(['A']); // B and C wait for A

    first.resolve({ data: { version: 4 } });
    const results = await Promise.all([a, b, c]);

    // B was superseded by C before it was sent; it settles with C's result.
    expect(sentMarkers()).toEqual(['A', 'C']);
    expect(results.map((result) => result.version)).toEqual([4, 5, 5]);
    expect(getKnownVersion('tie-1')).toBe(5);
  });

  it('a slow older save cannot land after a newer one', async () => {
    const slow = deferred();
    fakeInstance.put.mockReturnValueOnce(slow.promise);
    fakeInstance.put.mockResolvedValue({ data: { version: 9 } });

    const older = pushBoltHistory(doc({ marker: 'OLDER' }));
    const newer = pushBoltHistory(doc({ marker: 'NEWER' }));
    slow.reject(new Error('timeout'));
    await Promise.all([older, newer]);

    // The failed OLDER is not re-queued behind NEWER, which already superseded it.
    expect(sentMarkers()).toEqual(['OLDER', 'NEWER']);
    expect(getOfflineQueueDepth()).toBe(0);
  });

  it('keeps matches independent', async () => {
    const slow = deferred();
    fakeInstance.put.mockReturnValueOnce(slow.promise);
    fakeInstance.put.mockResolvedValue({ data: { version: 1 } });

    const first = pushBoltHistory(doc({ marker: 'T1' }));
    const other = await pushBoltHistory(doc({ tieMatchUpId: 'tie-2', marker: 'T2' }));
    expect(other.success).toBe(true);
    slow.resolve({ data: { version: 1 } });
    await first;
  });

  it('does not queue a save the server rejected as invalid', async () => {
    fakeInstance.put.mockRejectedValue(Object.assign(new Error('bad request'), { response: { status: 400 } }));
    const res = await pushBoltHistory(doc());
    expect(res.error).toBe('bad request');
    expect(getOfflineQueueDepth()).toBe(0);
  });

  it('flushes a queued snapshot once the server is reachable again', async () => {
    fakeInstance.put.mockRejectedValueOnce(new Error('offline'));
    fakeInstance.put.mockResolvedValue({ data: { version: 3 } });

    await pushBoltHistory(doc({ marker: 'QUEUED' }));
    expect(getOfflineQueueDepth()).toBe(1);
    expect(await flushOfflineQueue()).toEqual({ flushed: 1, remaining: 0 });
    expect(sentMarkers()).toEqual(['QUEUED', 'QUEUED']);
  });
});
