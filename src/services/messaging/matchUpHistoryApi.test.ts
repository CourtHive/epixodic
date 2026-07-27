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
