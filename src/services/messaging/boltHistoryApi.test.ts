import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./baseApi', () => {
  return {
    baseApi: {
      put: vi.fn(),
      get: vi.fn(),
    },
  };
});

import {
  __resetBoltHistoryApiForTests,
  fetchBoltHistory,
  fetchParentMatchUp,
  flushOfflineQueue,
  getKnownVersion,
  getOfflineQueueDepth,
  hydrateBoltHistoryOnMount,
  pushBoltHistory,
  pushBoltHistoryWithRetry,
  setKnownVersion,
} from './boltHistoryApi';
import type { BoltHistoryDocument } from './boltHistoryDocument';
import { baseApi } from './baseApi';

const buildDocument = (overrides: Partial<BoltHistoryDocument> = {}): BoltHistoryDocument => ({
  tieMatchUpId: 'tie-1',
  parentMatchUpId: 'parent-1',
  tournamentId: 'tour-1',
  sides: [],
  engineState: {},
  boltStarted: false,
  boltExpired: false,
  boltComplete: false,
  timeoutsUsed: { 1: 0, 2: 0 },
  pausedOnExit: false,
  createdAt: '2026-04-10T00:00:00.000Z',
  updatedAt: '2026-04-10T00:00:00.000Z',
  version: 0,
  ...overrides,
});

describe('boltHistoryApi', () => {
  beforeEach(() => {
    __resetBoltHistoryApiForTests();
    vi.mocked(baseApi.put).mockReset();
    vi.mocked(baseApi.get).mockReset();
  });

  afterEach(() => {
    __resetBoltHistoryApiForTests();
  });

  describe('pushBoltHistory', () => {
    it('PUTs the document and caches the returned version on success', async () => {
      vi.mocked(baseApi.put).mockResolvedValue({ data: { success: true, version: 3 } });
      const result = await pushBoltHistory(buildDocument());
      expect(result).toEqual({ success: true, version: 3 });
      expect(getKnownVersion('tie-1')).toBe(3);

      const [url, body] = vi.mocked(baseApi.put).mock.calls[0];
      expect(url).toBe('/api/bolt-history/tie-1');
      expect(body.document.tieMatchUpId).toBe('tie-1');
    });

    it('does NOT clear the version cache on VERSION_CONFLICT (let withRetry handle it)', async () => {
      setKnownVersion('tie-1', 5);
      vi.mocked(baseApi.put).mockResolvedValue({ data: { error: 'VERSION_CONFLICT' } });
      const result = await pushBoltHistory(buildDocument({ version: 5 }));
      expect(result.error).toBe('VERSION_CONFLICT');
      // Cache stays at 5 — retry path will reseed it via fetch
      expect(getKnownVersion('tie-1')).toBe(5);
    });

    it('queues for offline retry on network error', async () => {
      vi.mocked(baseApi.put).mockRejectedValue(new Error('connection refused'));
      const result = await pushBoltHistory(buildDocument());
      expect(result.error).toBe('connection refused');
      expect(getOfflineQueueDepth()).toBe(1);
    });

    it('replaces existing queued entry for the same tieMatchUpId on subsequent network errors', async () => {
      vi.mocked(baseApi.put).mockRejectedValue(new Error('still down'));
      await pushBoltHistory(buildDocument({ engineState: { sets: 1 } }));
      await pushBoltHistory(buildDocument({ engineState: { sets: 2 } }));
      expect(getOfflineQueueDepth()).toBe(1);
    });

    it('queues separate entries for different tieMatchUpIds', async () => {
      vi.mocked(baseApi.put).mockRejectedValue(new Error('down'));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-a' }));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-b' }));
      expect(getOfflineQueueDepth()).toBe(2);
    });
  });

  describe('flushOfflineQueue', () => {
    it('drains queued documents on next successful push', async () => {
      vi.mocked(baseApi.put).mockRejectedValueOnce(new Error('down'));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-a' }));
      expect(getOfflineQueueDepth()).toBe(1);

      vi.mocked(baseApi.put).mockResolvedValue({ data: { success: true, version: 1 } });
      const result = await flushOfflineQueue();
      expect(result.flushed).toBe(1);
      expect(getOfflineQueueDepth()).toBe(0);
    });

    it('drops VERSION_CONFLICT entries from the queue', async () => {
      vi.mocked(baseApi.put).mockRejectedValueOnce(new Error('down'));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-a' }));

      vi.mocked(baseApi.put).mockResolvedValue({ data: { error: 'VERSION_CONFLICT' } });
      const result = await flushOfflineQueue();
      expect(result.flushed).toBe(0);
      expect(getOfflineQueueDepth()).toBe(0);
    });

    it('stops draining on persistent network failure', async () => {
      vi.mocked(baseApi.put).mockRejectedValue(new Error('still down'));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-a' }));
      await pushBoltHistory(buildDocument({ tieMatchUpId: 'tie-b' }));
      const result = await flushOfflineQueue();
      expect(result.flushed).toBe(0);
      expect(getOfflineQueueDepth()).toBe(2);
    });
  });

  describe('fetchBoltHistory', () => {
    it('returns the document and caches its version', async () => {
      vi.mocked(baseApi.get).mockResolvedValue({
        data: { document: buildDocument({ version: 7 }) },
      });
      const result = await fetchBoltHistory('tie-1');
      expect(result.document?.version).toBe(7);
      expect(getKnownVersion('tie-1')).toBe(7);
    });

    it('returns not_found on 404', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ response: { status: 404 } });
      const result = await fetchBoltHistory('tie-missing');
      expect(result.error).toBe('not_found');
    });

    it('returns the network error message on other failures', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ message: 'boom' });
      const result = await fetchBoltHistory('tie-1');
      expect(result.error).toBe('boom');
    });
  });

  describe('pushBoltHistoryWithRetry', () => {
    it('returns the bare push result on success without refetching', async () => {
      vi.mocked(baseApi.put).mockResolvedValue({ data: { success: true, version: 1 } });
      const result = await pushBoltHistoryWithRetry(buildDocument());
      expect(result).toEqual({ success: true, version: 1 });
      expect(baseApi.get).not.toHaveBeenCalled();
    });

    it('surfaces SERVER_NEWER when the server has genuinely newer data', async () => {
      vi.mocked(baseApi.put).mockResolvedValue({ data: { error: 'VERSION_CONFLICT' } });
      vi.mocked(baseApi.get).mockResolvedValue({
        data: {
          document: buildDocument({
            version: 9,
            updatedAt: '2026-04-10T10:00:00.000Z',
          }),
        },
      });

      const result = await pushBoltHistoryWithRetry(
        buildDocument({ version: 5, updatedAt: '2026-04-10T09:00:00.000Z' }),
      );
      expect(result.error).toBe('SERVER_NEWER');
      expect(result.document?.version).toBe(9);
      // Version cache reseeded to server's version so the next push starts fresh
      expect(getKnownVersion('tie-1')).toBe(9);
    });

    it('reseeds version and retries when local is newer than the stored doc', async () => {
      // First put: conflict. Second put (after reseed): success.
      vi.mocked(baseApi.put)
        .mockResolvedValueOnce({ data: { error: 'VERSION_CONFLICT' } })
        .mockResolvedValueOnce({ data: { success: true, version: 10 } });
      // Server's stored doc is OLDER than our local edit
      vi.mocked(baseApi.get).mockResolvedValue({
        data: {
          document: buildDocument({
            version: 9,
            updatedAt: '2026-04-10T08:00:00.000Z',
          }),
        },
      });

      const result = await pushBoltHistoryWithRetry(
        buildDocument({ version: 5, updatedAt: '2026-04-10T10:00:00.000Z' }),
      );
      expect(result.success).toBe(true);
      expect(result.version).toBe(10);

      // Second put used the reseeded version
      const secondPut = vi.mocked(baseApi.put).mock.calls[1];
      expect(secondPut[1].document.version).toBe(9);
    });

    it('propagates the original conflict when the refetch returns nothing', async () => {
      vi.mocked(baseApi.put).mockResolvedValue({ data: { error: 'VERSION_CONFLICT' } });
      vi.mocked(baseApi.get).mockRejectedValue({ response: { status: 404 } });

      const result = await pushBoltHistoryWithRetry(buildDocument({ version: 5 }));
      expect(result.error).toBe('VERSION_CONFLICT');
    });
  });

  describe('hydrateBoltHistoryOnMount', () => {
    it('returns fresh when there is no server doc and no local timestamp', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ response: { status: 404 } });
      const result = await hydrateBoltHistoryOnMount('tie-1');
      expect(result.source).toBe('fresh');
      expect(result.document).toBeUndefined();
    });

    it('returns local when there is no server doc but local timestamp exists', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ response: { status: 404 } });
      const result = await hydrateBoltHistoryOnMount('tie-1', '2026-04-10T09:00:00.000Z');
      expect(result.source).toBe('local');
    });

    it('returns server when there is a server doc but no local', async () => {
      vi.mocked(baseApi.get).mockResolvedValue({
        data: { document: buildDocument({ version: 3 }) },
      });
      const result = await hydrateBoltHistoryOnMount('tie-1');
      expect(result.source).toBe('server');
      expect(result.document?.version).toBe(3);
    });

    it('returns server when server is newer than local', async () => {
      vi.mocked(baseApi.get).mockResolvedValue({
        data: {
          document: buildDocument({
            version: 5,
            updatedAt: '2026-04-10T10:00:00.000Z',
          }),
        },
      });
      const result = await hydrateBoltHistoryOnMount('tie-1', '2026-04-10T09:00:00.000Z');
      expect(result.source).toBe('server');
    });

    it('returns local when local is newer than server', async () => {
      vi.mocked(baseApi.get).mockResolvedValue({
        data: {
          document: buildDocument({
            version: 5,
            updatedAt: '2026-04-10T08:00:00.000Z',
          }),
        },
      });
      const result = await hydrateBoltHistoryOnMount('tie-1', '2026-04-10T10:00:00.000Z');
      expect(result.source).toBe('local');
    });

    it('returns local on tied timestamps (no point overwriting current state)', async () => {
      const sameTime = '2026-04-10T09:00:00.000Z';
      vi.mocked(baseApi.get).mockResolvedValue({
        data: { document: buildDocument({ version: 5, updatedAt: sameTime }) },
      });
      const result = await hydrateBoltHistoryOnMount('tie-1', sameTime);
      expect(result.source).toBe('local');
    });

    it('falls back to local on a network error rather than crashing the mount', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ message: 'connection refused' });
      const result = await hydrateBoltHistoryOnMount('tie-1', '2026-04-10T09:00:00.000Z');
      expect(result.source).toBe('local');
    });
  });

  describe('fetchParentMatchUp', () => {
    it('returns the team matchUp on success', async () => {
      const teamMatchUp = { matchUpId: 'parent-1', matchUpType: 'TEAM', tieMatchUps: [{ matchUpId: 'tie-1' }] };
      vi.mocked(baseApi.get).mockResolvedValue({ data: { teamMatchUp } });
      const result = await fetchParentMatchUp('tie-1');
      expect(result.teamMatchUp).toEqual(teamMatchUp);
      expect(vi.mocked(baseApi.get).mock.calls[0][0]).toBe('/api/bolt-history/tie-1/parent-matchup');
    });

    it('returns not_found on 404', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ response: { status: 404 } });
      const result = await fetchParentMatchUp('tie-missing');
      expect(result.error).toBe('not_found');
    });

    it('returns the network error message on other failures', async () => {
      vi.mocked(baseApi.get).mockRejectedValue({ message: 'boom' });
      const result = await fetchParentMatchUp('tie-1');
      expect(result.error).toBe('boom');
    });
  });
});
