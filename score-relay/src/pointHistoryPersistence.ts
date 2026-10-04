// Per-point history persistence — S3 relay write path.
//
// The relay accumulates points off the /tracker `score` stream (decision D1) and
// POSTs each one to courthive-query's ingest endpoint (decision D3(b)):
//   POST {POINT_HISTORY_URL}/match-up-point-history/:matchUpId/points
// authenticated with the relay's `score`-role service JWT (the same
// RELAY_SERVICE_JWT used for CFS /factory/score). courthive-query owns the
// durable `match_up_point_history` SOURCE table; CFS/CODES never carry points.
//
// Fire-and-forget with bounded retry — a persistence failure must never block
// the broadcast/ack path. Disabled (no-op) when POINT_HISTORY_URL is unset.
// Design: Mentat/planning/MATCHUP_HISTORY_PERSISTENCE.md.

import axios from 'axios';
import type { ScoreUpdate } from './types.js';
import type { CrowdScoringSession } from './crowd/types.js';

let baseUrl: string | undefined;
let serviceJwt: string | undefined;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export function configurePointHistoryPersistence(url?: string, jwt?: string): void {
  baseUrl = url?.replace(/\/+$/, '') || undefined;
  serviceJwt = jwt;
}

export function isPointHistoryPersistenceEnabled(): boolean {
  return !!baseUrl;
}

/**
 * Map the on-wire `ScoreUpdate.point` → the stored CODES `Point`. Prefers the
 * CODES-aligned fields when a producer sends them (forward-compatible);
 * otherwise derives `winningSide`/`serverSideNumber` from the legacy 0-indexed
 * `winner`/`server`. `serverParticipantId` (doubles rotation) can ONLY come from
 * a producer that sends it — the legacy shape cannot express it. Returns null
 * when the event carries no point.
 */
export function toStoredPoint(update: ScoreUpdate): Record<string, unknown> | null {
  const p = update.point;
  if (!p) return null;

  const winningSide = typeof p.winningSide === 'number' ? p.winningSide : numOrUndef(p.winner, +1);
  const serverSideNumber =
    typeof p.serverSideNumber === 'number' ? p.serverSideNumber : numOrUndef(p.server, +1);

  const point: Record<string, unknown> = {};
  if (typeof p.pointNumber === 'number') point.pointNumber = p.pointNumber;
  if (winningSide !== undefined) point.winningSide = winningSide;
  if (serverSideNumber !== undefined) point.serverSideNumber = serverSideNumber;
  if (typeof p.serverParticipantId === 'string') point.serverParticipantId = p.serverParticipantId;

  // Decoration passthrough (MCP-style detail + engine timestamp/score).
  for (const key of ['timestamp', 'score', 'result', 'code', 'hand', 'stroke', 'rallyLength'] as const) {
    if (p[key] !== undefined) point[key] = p[key];
  }
  return point;
}

function numOrUndef(v: number | undefined, delta: number): number | undefined {
  return typeof v === 'number' ? v + delta : undefined;
}

/**
 * Map a crowd session's `CrowdPoint[]` → CODES `Point[]` for the durable store.
 * CrowdPoint already carries side numbers (`winner`/`server` are 1|2), so no
 * 0-index shift; derive `pointNumber` from order and carry `result`/timestamp.
 */
function crowdPointsToStored(session: CrowdScoringSession): Record<string, unknown>[] {
  return (session.pointHistory ?? []).map((p, i) => {
    const point: Record<string, unknown> = { pointNumber: i + 1, winningSide: p.winner };
    if (typeof p.server === 'number') point.serverSideNumber = p.server;
    if (p.result !== undefined) point.result = p.result;
    if (p.recordedAt !== undefined) point.timestamp = p.recordedAt;
    return point;
  });
}

/**
 * Materialize a promoted crowd session's points into the durable store (D4/S6).
 * On promotion the relay force-replaces the matchUp's points with the crowd
 * sequence, tagged `provenance:'crowd-promoted'`. No-op when disabled or the
 * session lacks identity/points. Fire-and-forget; never throws.
 */
export async function persistCrowdPromotedPoints(session: CrowdScoringSession): Promise<void> {
  if (!baseUrl) return;
  if (!session?.matchUpId || !session.tournamentId) return;
  const points = crowdPointsToStored(session);
  if (points.length === 0) return;

  const body = {
    tournamentId: session.tournamentId,
    matchUpFormat: session.formatHint,
    points,
    provenance: 'crowd-promoted' as const,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceJwt) headers.Authorization = `Bearer ${serviceJwt}`;
  const url = `${baseUrl}/match-up-point-history/${encodeURIComponent(session.matchUpId)}/points`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.put(url, body, { headers });
      return;
    } catch (err: any) {
      if (attempt === MAX_RETRIES) {
        console.error(
          `[point-history] failed to materialize crowd-promoted points for ${session.matchUpId} ` +
            `after ${MAX_RETRIES} attempts (status=${err?.response?.status ?? 'n/a'}): ${err?.message}`,
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
      }
    }
  }
}

/**
 * Persist one point. No-op when disabled, when the event omits a point, or when
 * it lacks the tournamentId/matchUpId the store requires. Bounded exponential
 * retry; never throws.
 */
export async function persistPoint(update: ScoreUpdate): Promise<void> {
  if (!baseUrl) return;
  if (!update.matchUpId || !update.tournamentId) return;
  const point = toStoredPoint(update);
  if (!point) return;

  const body = {
    tournamentId: update.tournamentId,
    matchUpFormat: update.matchUpFormat,
    point,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceJwt) headers.Authorization = `Bearer ${serviceJwt}`;
  const url = `${baseUrl}/match-up-point-history/${encodeURIComponent(update.matchUpId)}/points`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(url, body, { headers });
      return;
    } catch (err: any) {
      if (attempt === MAX_RETRIES) {
        console.error(
          `[point-history] failed to persist a point for ${update.matchUpId} after ${MAX_RETRIES} attempts ` +
            `(status=${err?.response?.status ?? 'n/a'}): ${err?.message}`,
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
      }
    }
  }
}
