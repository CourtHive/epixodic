import { getJwtTokenStorageKey } from '../../config/getJwtTokenStorageKey';
import { browserStorage } from '../../state/browserStorage';
import type { BoltHistoryDocument } from './boltHistoryDocument';
import axios from 'axios';

/**
 * REST client for the durable matchUp point-by-point history service
 * (courthive-query), replacing the retired CFS bolt-history endpoints (S5).
 *
 * The client's `BoltHistoryDocument` is a sport-agnostic RUNTIME ENVELOPE — it is
 * stored verbatim in courthive-query's `runtime_state` via
 * `PUT /match-up-point-history/:matchUpId/state`, and read back on resume via
 * `GET /match-up-point-history/:matchUpId` (which returns `{ document: { runtimeState,
 * version, updatedAt } }`). Local `browserStorage` remains the primary live-scoring
 * store; this is the durable cross-device backup.
 *
 * Concurrency: courthive-query's row `version` is shared with the relay's per-point
 * append, so it is NOT a clean optimistic key for the client's envelope save. We
 * therefore force-save (last-write-wins on the envelope) and resolve cross-device
 * "who is newer" at hydration via the envelope's `updatedAt`. The version cache is
 * kept for informational continuity only.
 *
 * Ordering: with no server-side version check, the CLIENT must never let an older
 * envelope land after a newer one. Saves therefore run through one lane per
 * matchUp: at most one request in flight, and only the latest snapshot waits
 * behind it (a newer save replaces a waiting or failed older one). A snapshot that
 * failed to send is parked in its lane until the next save or flush.
 */

const JWT_TOKEN_STORAGE_NAME = getJwtTokenStorageKey();

function getQueryBaseURL(): string {
  const override = import.meta.env.VITE_QUERY_URL;
  if (override) return override;
  const hostname = globalThis.location?.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3150';
  }
  // Prod: courthive-query proxied same-origin under /query (mirrors the relay's
  // /relay path). Confirm the nginx route at deploy; override via VITE_QUERY_URL.
  return `${globalThis.location.origin}/query`;
}

const queryApi = axios.create({ baseURL: getQueryBaseURL() });
queryApi.interceptors.request.use((config) => {
  const token = browserStorage.get(JWT_TOKEN_STORAGE_NAME);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- version cache + per-matchUp save lanes ---

const knownVersions = new Map<string, number>();

interface SaveLane {
  inFlight: boolean;
  /** The latest snapshot not yet sent: newer than anything in flight, or parked after a failure. */
  pending?: BoltHistoryDocument;
  /** Callers whose snapshot is `pending`, or was replaced by it; they settle with its result. */
  waiters: Array<(result: PushResult) => void>;
}

const lanes = new Map<string, SaveLane>();

export function getKnownVersion(matchUpId: string): number {
  return knownVersions.get(matchUpId) ?? 0;
}
export function setKnownVersion(matchUpId: string, version: number): void {
  knownVersions.set(matchUpId, version);
}
export function clearKnownVersion(matchUpId: string): void {
  knownVersions.delete(matchUpId);
}
/** Matches whose latest snapshot failed to send and waits for a retry. */
export function getOfflineQueueDepth(): number {
  let parked = 0;
  for (const lane of lanes.values()) if (lane.pending && !lane.inFlight) parked += 1;
  return parked;
}

export interface PushResult {
  success?: boolean;
  version?: number;
  error?: string;
  /** Reserved for cross-device adoption; unused under last-write-wins. */
  document?: BoltHistoryDocument;
}

function stateBody(document: BoltHistoryDocument) {
  return {
    tournamentId: document.tournamentId,
    parentMatchUpId: document.parentMatchUpId,
    eventId: document.eventId,
    drawId: document.drawId,
    matchUpFormat: document.matchUpFormat,
    // The whole envelope (engine state, clocks, timeouts, competition profile,
    // format runtime, and — when the caller adds it — the parent/team context).
    runtimeState: document,
  };
}

/**
 * Save an envelope. Resolves when it, or a newer snapshot of the same matchUp
 * that superseded it before it was sent, has been accepted or has failed.
 */
export function pushBoltHistory(document: BoltHistoryDocument): Promise<PushResult> {
  const matchUpId = document.tieMatchUpId;
  let lane = lanes.get(matchUpId);
  if (!lane) {
    lane = { inFlight: false, waiters: [] };
    lanes.set(matchUpId, lane);
  }
  lane.pending = document;
  const settled = new Promise<PushResult>((resolve) => lane.waiters.push(resolve));
  if (!lane.inFlight) sendLane(matchUpId, lane);
  return settled;
}

/** Statuses that will fail the same way on retry; anything else may be transient. */
const NON_RETRYABLE_STATUSES = new Set([400, 404, 409, 413, 422]);

function isRetryable(err: any): boolean {
  const status = err?.response?.status;
  return typeof status !== 'number' || !NON_RETRYABLE_STATUSES.has(status);
}

/** Send the lane's pending snapshot; when it settles, send whatever newer one arrived meanwhile. */
function sendLane(matchUpId: string, lane: SaveLane): Promise<PushResult> {
  const document = lane.pending!;
  const waiters = lane.waiters;
  lane.pending = undefined;
  lane.waiters = [];
  lane.inFlight = true;

  return queryApi
    .put(`/match-up-point-history/${encodeURIComponent(matchUpId)}/state`, stateBody(document))
    .then(
      (response): PushResult => {
        const version = response?.data?.version;
        if (typeof version !== 'number') return { error: 'unknown server response' };
        setKnownVersion(matchUpId, version);
        return { success: true, version };
      },
      (err): PushResult => {
        // Park the snapshot for a retry unless a newer one already replaced it.
        if (isRetryable(err) && !lane.pending) lane.pending = document;
        return { error: (err as Error)?.message ?? 'network error' };
      },
    )
    .then((result) => {
      lane.inFlight = false;
      for (const settle of waiters) settle(result);
      const newerArrived = lane.waiters.length > 0;
      if (newerArrived) sendLane(matchUpId, lane);
      else if (!lane.pending) lanes.delete(matchUpId);
      // The server answered: retry other matches' parked snapshots.
      if (result.success) flushOfflineQueue();
      return result;
    });
}

/**
 * Kept for contract compatibility. Under last-write-wins there is no version
 * conflict to recover from, so this is a thin pass-through to `pushBoltHistory`.
 */
export async function pushBoltHistoryWithRetry(document: BoltHistoryDocument): Promise<PushResult> {
  return pushBoltHistory(document);
}

export interface HydrationResult {
  source: 'server' | 'local' | 'fresh';
  document?: BoltHistoryDocument;
}

/**
 * Decide whether local cached state or the server's stored envelope is newer.
 * Same decision tree as before (newer wall-clock wins, ties favor local; server
 * with no local → cross-device handoff; neither → fresh; fetch error → local).
 */
export async function hydrateBoltHistoryOnMount(
  matchUpId: string,
  localUpdatedAt?: string,
): Promise<HydrationResult> {
  const fetched = await fetchBoltHistory(matchUpId);

  if (fetched.error === 'not_found' || !fetched.document) {
    return { source: localUpdatedAt ? 'local' : 'fresh' };
  }
  if (fetched.error) {
    console.warn(`[matchUpHistoryApi] hydration fetch failed for ${matchUpId}: ${fetched.error}`);
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

/**
 * GET the stored envelope and reconstruct the client `BoltHistoryDocument`
 * (runtimeState + the row's version). Returns not_found when there is no row or
 * no envelope yet (e.g. the relay has appended points but the client never saved).
 */
export async function fetchBoltHistory(
  matchUpId: string,
): Promise<{ document?: BoltHistoryDocument; error?: string }> {
  try {
    const response = await queryApi.get(`/match-up-point-history/${encodeURIComponent(matchUpId)}`);
    const stored = response?.data?.document;
    const runtimeState = stored?.runtimeState;
    if (!runtimeState) return { error: 'not_found' };
    const document = { ...runtimeState, version: stored.version } as BoltHistoryDocument;
    if (typeof stored.version === 'number') setKnownVersion(matchUpId, stored.version);
    return { document };
  } catch (err: any) {
    if (err?.response?.status === 404) return { error: 'not_found' };
    return { error: err?.message ?? 'network error' };
  }
}

/**
 * Resolve the parent team matchUp for a fresh-device handoff. Sourced from the
 * envelope's `teamMatchUp` (the caller includes it when saving), since
 * courthive-query stores no tournament record.
 */
export async function fetchParentMatchUp(
  matchUpId: string,
): Promise<{ teamMatchUp?: any; error?: string }> {
  const fetched = await fetchBoltHistory(matchUpId);
  if (fetched.error) return { error: fetched.error };
  const teamMatchUp = (fetched.document as any)?.teamMatchUp;
  if (!teamMatchUp) return { error: 'not_found' };
  return { teamMatchUp };
}

/** Retry every parked snapshot. Lanes already sending are left alone. */
export async function flushOfflineQueue(): Promise<{ flushed: number; remaining: number }> {
  const parked = [...lanes.entries()].filter(([, lane]) => lane.pending && !lane.inFlight);
  const results = await Promise.all(parked.map(([matchUpId, lane]) => sendLane(matchUpId, lane)));
  const flushed = results.filter((result) => result.success).length;
  return { flushed, remaining: getOfflineQueueDepth() };
}

// Test helper — clears all in-memory state. Not part of the public API.
export function __resetMatchUpHistoryApiForTests(): void {
  knownVersions.clear();
  lanes.clear();
}
