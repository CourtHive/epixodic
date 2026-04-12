import { baseApi } from './baseApi';
import type { BoltHistoryDocument } from './boltHistoryDocument';

/**
 * REST client for the server's IBoltHistoryStorage.
 *
 * - `pushBoltHistory(document)` PUTs to /api/bolt-history/:tieMatchUpId
 *   and updates the in-memory version cache on success.
 *
 * - `pushBoltHistoryWithRetry(document)` adds VERSION_CONFLICT recovery:
 *   on conflict, refetches the server's current document and either
 *   surfaces SERVER_NEWER (server has data the caller should adopt) or
 *   reseeds the version cache and retries the push once. This is the
 *   correct way to recover from concurrent edits — `pushBoltHistory`
 *   alone leaves the cache in an inconsistent state on conflict.
 *
 * - `fetchBoltHistory(tieMatchUpId)` GETs the stored document. Used by
 *   the hydration helper on BoltScoringPage mount and by the conflict
 *   recovery path.
 *
 * - `hydrateBoltHistoryOnMount(tieMatchUpId, localUpdatedAt)` decides
 *   whether the local cached state or the server's stored state is
 *   newer and returns a directive describing which to apply. The
 *   caller is responsible for actually rehydrating UI state because
 *   that touches Svelte stores.
 *
 * - On network failure, documents are queued in-memory and re-tried
 *   automatically on the next push or whenever `flushOfflineQueue()`
 *   runs (e.g. on `window.online` events).
 */

const knownVersions = new Map<string, number>();
const offlineQueue: BoltHistoryDocument[] = [];
let flushing = false;

export function getKnownVersion(tieMatchUpId: string): number {
  return knownVersions.get(tieMatchUpId) ?? 0;
}

export function setKnownVersion(tieMatchUpId: string, version: number): void {
  knownVersions.set(tieMatchUpId, version);
}

export function clearKnownVersion(tieMatchUpId: string): void {
  knownVersions.delete(tieMatchUpId);
}

export function getOfflineQueueDepth(): number {
  return offlineQueue.length;
}

export interface PushResult {
  success?: boolean;
  version?: number;
  error?: string;
  /** On SERVER_NEWER, contains the freshly-fetched server document. */
  document?: BoltHistoryDocument;
}

export async function pushBoltHistory(document: BoltHistoryDocument): Promise<PushResult> {
  try {
    const response = await baseApi.put(`/api/bolt-history/${encodeURIComponent(document.tieMatchUpId)}`, {
      document,
    });
    const data = response?.data ?? {};
    if (data.success && typeof data.version === 'number') {
      setKnownVersion(document.tieMatchUpId, data.version);
      // Opportunistically drain anything that was queued while offline.
      void flushOfflineQueue();
      return { success: true, version: data.version };
    }
    if (data.error === 'VERSION_CONFLICT') {
      // Don't clear the version cache here — let pushBoltHistoryWithRetry
      // refetch and reseed it correctly. Clearing the cache on bare
      // pushBoltHistory creates a permanent conflict loop because the
      // next push starts at version 0 against a server already at N>0.
      return { error: 'VERSION_CONFLICT' };
    }
    return { error: data.error ?? 'unknown server response' };
  } catch (err) {
    // Network error → enqueue for retry. Replace any existing queued
    // entry for this tieMatchUpId so the most recent state wins.
    enqueueOffline(document);
    return { error: (err as Error)?.message ?? 'network error' };
  }
}

/**
 * Push with VERSION_CONFLICT recovery.
 *
 * Flow on conflict:
 *   1. GET the server's current document
 *   2. If server is missing → propagate the original conflict (race)
 *   3. If server.updatedAt > local.updatedAt → server has genuinely
 *      newer data; return SERVER_NEWER with the document so the
 *      caller can adopt it
 *   4. If server.updatedAt <= local.updatedAt → our state is newer
 *      but the server's version counter is ahead (e.g. someone else
 *      pushed a stale write). Reseed our version to the server's and
 *      retry the push exactly once.
 */
export async function pushBoltHistoryWithRetry(document: BoltHistoryDocument): Promise<PushResult> {
  const result = await pushBoltHistory(document);
  if (result.error !== 'VERSION_CONFLICT') return result;

  const fresh = await fetchBoltHistory(document.tieMatchUpId);
  if (!fresh.document) {
    return result; // Race or fetch error — nothing to recover from.
  }

  const serverTime = new Date(fresh.document.updatedAt).getTime();
  const localTime = new Date(document.updatedAt).getTime();

  if (Number.isFinite(serverTime) && Number.isFinite(localTime) && serverTime > localTime) {
    // Server is genuinely newer — caller should adopt the server's document.
    setKnownVersion(document.tieMatchUpId, fresh.document.version);
    console.warn(
      `[boltHistoryApi] SERVER_NEWER for ${document.tieMatchUpId} (server=${fresh.document.updatedAt}, local=${document.updatedAt})`,
    );
    return { error: 'SERVER_NEWER', document: fresh.document };
  }

  // Our state is newer; reseed the version and retry once.
  setKnownVersion(document.tieMatchUpId, fresh.document.version);
  const rebuilt: BoltHistoryDocument = { ...document, version: fresh.document.version };
  return pushBoltHistory(rebuilt);
}

export interface HydrationResult {
  source: 'server' | 'local' | 'fresh';
  document?: BoltHistoryDocument;
}

/**
 * Decide whether the local cached state or the server's stored state
 * is newer for the given tieMatchUp. Returns a directive — the caller
 * (Svelte component or store) is responsible for actually applying
 * the chosen state because that touches reactive stores.
 *
 * Decision tree:
 *   server doc + local exists  → newer wall-clock wins (ties favor local)
 *   server doc, no local       → SERVER (cross-device handoff)
 *   no server doc, local       → LOCAL (offline-first scorer)
 *   neither                    → FRESH
 *   server fetch network error → LOCAL if available, else FRESH
 */
export async function hydrateBoltHistoryOnMount(
  tieMatchUpId: string,
  localUpdatedAt?: string,
): Promise<HydrationResult> {
  const fetched = await fetchBoltHistory(tieMatchUpId);

  if (fetched.error === 'not_found' || !fetched.document) {
    return { source: localUpdatedAt ? 'local' : 'fresh' };
  }

  if (fetched.error) {
    // Network error or other failure — fall back to local
    console.warn(`[boltHistoryApi] hydration fetch failed for ${tieMatchUpId}: ${fetched.error}`);
    return { source: localUpdatedAt ? 'local' : 'fresh' };
  }

  if (!localUpdatedAt) {
    return { source: 'server', document: fetched.document };
  }

  const serverTime = new Date(fetched.document.updatedAt).getTime();
  const localTime = new Date(localUpdatedAt).getTime();

  if (Number.isFinite(serverTime) && Number.isFinite(localTime) && serverTime > localTime) {
    return { source: 'server', document: fetched.document };
  }

  return { source: 'local' };
}

export async function fetchBoltHistory(
  tieMatchUpId: string,
): Promise<{ document?: BoltHistoryDocument; error?: string }> {
  try {
    const response = await baseApi.get(`/api/bolt-history/${encodeURIComponent(tieMatchUpId)}`);
    const document = response?.data?.document as BoltHistoryDocument | undefined;
    if (document?.version) setKnownVersion(tieMatchUpId, document.version);
    return { document };
  } catch (err: any) {
    if (err?.response?.status === 404) return { error: 'not_found' };
    return { error: err?.message ?? 'network error' };
  }
}

/**
 * Fetch the parent team matchUp for a tieMatchUp from the server.
 *
 * Used by the fully-fresh-device hydration path: when the local
 * browserStorage has no `team-{parentMatchUpId}` entry AND no
 * `tie-parent-{tieMatchUpId}` reverse lookup, the client needs to
 * resolve the parent team matchUp from the server before hydration
 * can populate the store.
 *
 * Returns the team matchUp shape that epixodic expects (the same
 * shape that `setTeamMatchUp` accepts).
 */
export async function fetchParentMatchUp(
  tieMatchUpId: string,
): Promise<{ teamMatchUp?: any; error?: string }> {
  try {
    const response = await baseApi.get(
      `/api/bolt-history/${encodeURIComponent(tieMatchUpId)}/parent-matchup`,
    );
    const teamMatchUp = response?.data?.teamMatchUp;
    return { teamMatchUp };
  } catch (err: any) {
    if (err?.response?.status === 404) return { error: 'not_found' };
    return { error: err?.message ?? 'network error' };
  }
}

export async function flushOfflineQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return { flushed: 0, remaining: offlineQueue.length };
  if (offlineQueue.length === 0) return { flushed: 0, remaining: 0 };

  flushing = true;
  let flushed = 0;
  try {
    while (offlineQueue.length > 0) {
      const next = offlineQueue[0];
      try {
        const response = await baseApi.put(
          `/api/bolt-history/${encodeURIComponent(next.tieMatchUpId)}`,
          { document: next },
        );
        const data = response?.data ?? {};
        if (data.success) {
          offlineQueue.shift();
          flushed += 1;
          if (typeof data.version === 'number') setKnownVersion(next.tieMatchUpId, data.version);
        } else if (data.error === 'VERSION_CONFLICT') {
          // Drop the stale entry; the next live push will recover.
          offlineQueue.shift();
          clearKnownVersion(next.tieMatchUpId);
        } else {
          break;
        }
      } catch {
        // Still offline — bail out and try again later.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, remaining: offlineQueue.length };
}

function enqueueOffline(document: BoltHistoryDocument): void {
  // De-dupe: only the latest state per tieMatchUpId needs to be replayed.
  const idx = offlineQueue.findIndex((d) => d.tieMatchUpId === document.tieMatchUpId);
  if (idx !== -1) {
    offlineQueue[idx] = document;
  } else {
    offlineQueue.push(document);
  }
}

// Test helper — clears all in-memory state. Not part of the public API.
export function __resetBoltHistoryApiForTests(): void {
  knownVersions.clear();
  offlineQueue.length = 0;
  flushing = false;
}
