/**
 * crowdRelay — epixodic's `/crowd` producer (crowd-scoring Phase D).
 *
 * When epixodic is launched from courthive-public with a scorer identity
 * (see crowdScorerIdentity), it relays its live scores to the score-relay's
 * `/crowd` namespace as that HiveID person — the same path courthive-public's
 * inline scoring uses. This is what makes a nominated scorer's epixodic scores
 * flow through TMX's classifyScorer → one-click Accept. It reuses epixodic's
 * existing relay origin/path resolution (same relay, different namespace).
 *
 * Advisory only: like the /tracker feed, crowd scores never mutate the
 * authoritative record — the TD accepts them in TMX. Never throws.
 */

import { io, Socket } from 'socket.io-client';
import { getRelayConfig } from './scoreRelay';

export interface CrowdScorer {
  personId: string | null;
  displayName: string;
  audience?: 'hiveid';
}

export interface CrowdSubmitParams {
  token: string;
  sessionId: string;
  matchUpId: string;
  tournamentId?: string;
  clientId: string;
  point?: any;
  currentScore?: any;
  formatHint?: string;
  scorer: CrowdScorer;
}

let crowdSocket: Socket | null = null;
let connectedWith: string | undefined;
const versionBySession = new Map<string, number>();

function connect(token: string): Socket {
  if (crowdSocket && connectedWith === token) return crowdSocket;
  if (crowdSocket) crowdSocket.disconnect();

  const { origin, path } = getRelayConfig();
  crowdSocket = io(`${origin}/crowd`, {
    auth: { token },
    path,
    transports: ['websocket'],
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });
  connectedWith = token;

  crowdSocket.on('acked', (payload: any) => {
    if (payload?.sessionId && typeof payload.version === 'number') versionBySession.set(payload.sessionId, payload.version);
  });
  crowdSocket.on('rejected', (payload: any) => {
    if (payload?.reason === 'version-conflict' && payload.sessionId) versionBySession.delete(payload.sessionId);
    console.warn('[crowdRelay] rejected:', payload?.reason);
  });

  return crowdSocket;
}

/** Relay a crowd-scored point for a session. Never throws. */
export function submitCrowdScore(params: CrowdSubmitParams): void {
  try {
    const socket = connect(params.token);
    const expectedVersion = versionBySession.get(params.sessionId);
    const payload: any = {
      sessionId: params.sessionId,
      matchUpId: params.matchUpId,
      tournamentId: params.tournamentId,
      clientId: params.clientId,
      point: params.point,
      currentScore: params.currentScore,
      scorer: params.scorer,
    };
    if (params.formatHint) payload.formatHint = params.formatHint;
    if (typeof expectedVersion === 'number') payload.expectedVersion = expectedVersion;
    socket.emit('submitCrowdScore', payload);
  } catch (err) {
    console.warn('[crowdRelay] submit failed', err);
  }
}

/** End a crowd session (best-effort). */
export function endCrowdSession(token: string, sessionId: string): void {
  try {
    connect(token).emit('endSession', { sessionId });
    versionBySession.delete(sessionId);
  } catch {
    /* best-effort */
  }
}

export function disconnectCrowd(): void {
  crowdSocket?.disconnect();
  crowdSocket = null;
  connectedWith = undefined;
  versionBySession.clear();
}
