/**
 * /crowd Socket.IO namespace — Phase 3 slice 2.
 *
 * Authenticated visitors on courthive-public connect here to stream
 * point-by-point crowd scoring events. Authoritative data lives in
 * competition-factory-server; this namespace persists unofficial
 * crowd guesses to the `crowd` Postgres schema and never echoes them
 * back as authoritative scores.
 *
 * Protocol:
 *   handshake auth: { token: '<jwt>' }
 *
 *   client → 'submitCrowdScore' { sessionId, matchUpId, tournamentId,
 *                                  clientId, point, currentScore,
 *                                  expectedVersion?, formatHint? }
 *           - First event with a new sessionId auto-creates the session.
 *           - Each event appends a point with optimistic version semantics.
 *   server → 'acked' { sessionId, version }
 *   server → 'rejected' { sessionId, reason, retryAfter? }
 *
 *   client → 'endSession' { sessionId }
 *   server → 'sessionEnded' { sessionId }
 *
 * On disconnect: release the user's in-memory session slot. The
 * Postgres session row stays `active` so the user can resume from
 * another device; the inactivity scheduler eventually cleans stale ones.
 */

import type { Namespace, Server, Socket } from 'socket.io';
import { verifyHs256, JwtVerificationError, normalizeAudiences, type JwtPayload } from './jwtVerify.js';
import {
  SessionNotFoundError,
  VersionConflictError,
  type CrowdPoint,
  type CrowdScoreSnapshot,
  type CrowdScorerAttribution,
} from './types.js';
import type { CrowdScoringStorage } from './storage.js';
import type { UserLimits } from './userLimits.js';

type CrowdAudience = 'admin' | 'hiveid';

export interface CrowdNamespaceOptions {
  io: Server;
  storage: CrowdScoringStorage;
  userLimits: UserLimits;
  /** Shared HS256 secret matching competition-factory-server's JWT_SECRET. */
  jwtSecret: string;
  logger?: (message: string) => void;
}

export interface SubmitCrowdScorePayload {
  sessionId: string;
  matchUpId: string;
  tournamentId: string;
  clientId: string;
  point: CrowdPoint;
  currentScore: CrowdScoreSnapshot;
  /** Required for resume; omit on the first event for a session. */
  expectedVersion?: number;
  formatHint?: string;
  /**
   * HiveID attribution from courthive-public. Recorded on session
   * creation only. For hiveid-aud sockets the JWT-derived personId
   * wins over the client-supplied value (defense-in-depth — a client
   * could otherwise impersonate another Person). Admin-aud sockets
   * may attribute on behalf of someone, so payload values are used
   * as-is there.
   */
  scorer?: {
    personId: string | null;
    displayName: string;
    audience?: CrowdAudience;
  };
}

export interface EndSessionPayload {
  sessionId: string;
}

interface SocketData {
  userId: string;
  /** Resolved audience after `aud` claim normalization. */
  audience: CrowdAudience;
  /** JWT-attested canonical Person id (hiveid-aud sockets only). */
  personId?: string;
  /** Cached display name from JWT for hiveid-aud sockets. */
  displayName?: string;
  acquiredSessions: Set<string>;
}

const NAMESPACE_PATH = '/crowd';

export function attachCrowdNamespace(opts: CrowdNamespaceOptions): Namespace {
  const log = opts.logger ?? ((m: string) => console.log(`[crowd-ns] ${m}`));

  const ns = opts.io.of(NAMESPACE_PATH);

  ns.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      log(`reject ${socket.id}: missing-token`);
      next(new Error('missing-token'));
      return;
    }
    let payload: JwtPayload;
    try {
      payload = verifyHs256(token, opts.jwtSecret, { expectedAudiences: ['admin', 'hiveid'] });
    } catch (err) {
      const reason = err instanceof JwtVerificationError ? err.reason : 'bad-token';
      log(`reject ${socket.id}: ${reason}`);
      next(new Error(reason));
      return;
    }
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) {
      log(`reject ${socket.id}: missing-sub`);
      next(new Error('missing-sub'));
      return;
    }
    const audience = resolveAudience(payload);
    let personId: string | undefined;
    let displayName: string | undefined;
    if (audience === 'hiveid') {
      const claimed = typeof payload.personId === 'string' ? payload.personId : undefined;
      if (!claimed) {
        log(`reject ${socket.id}: missing-person-id`);
        next(new Error('missing-person-id'));
        return;
      }
      personId = claimed;
      displayName = typeof payload.displayName === 'string' ? payload.displayName : undefined;
    }
    (socket.data as SocketData) = { userId, audience, personId, displayName, acquiredSessions: new Set<string>() };
    next();
  });

  ns.on('connection', (socket) => {
    const data = socket.data as SocketData;
    log(`connect ${socket.id} user=${data.userId}`);

    socket.on('submitCrowdScore', async (payload: unknown) => {
      await handleSubmit(socket, payload as SubmitCrowdScorePayload | undefined, opts).catch((err) => {
        log(`submitCrowdScore unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        const sessionId = (payload as { sessionId?: unknown } | undefined)?.sessionId;
        socket.emit('rejected', { sessionId, reason: 'internal-error' });
      });
    });

    socket.on('endSession', async (payload: unknown) => {
      await handleEnd(socket, payload as EndSessionPayload | undefined, opts).catch((err) => {
        log(`endSession unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        const sessionId = (payload as { sessionId?: unknown } | undefined)?.sessionId;
        socket.emit('rejected', { sessionId, reason: 'internal-error' });
      });
    });

    socket.on('disconnect', () => {
      for (const sessionId of data.acquiredSessions) {
        opts.userLimits.releaseSession(data.userId, sessionId);
      }
      data.acquiredSessions.clear();
      log(`disconnect ${socket.id} user=${data.userId}`);
    });
  });

  return ns;
}

async function handleSubmit(
  socket: Socket,
  payload: SubmitCrowdScorePayload | undefined,
  opts: CrowdNamespaceOptions,
): Promise<void> {
  const data = socket.data as SocketData;
  if (!isValidSubmitPayload(payload)) {
    const sessionId = (payload as { sessionId?: unknown } | undefined)?.sessionId;
    socket.emit('rejected', { sessionId, reason: 'invalid-payload' });
    return;
  }

  const rate = opts.userLimits.tryConsumeEvent(data.userId);
  if (!rate.allowed) {
    socket.emit('rejected', { sessionId: payload.sessionId, reason: 'rate-limited', retryAfter: rate.retryAfter });
    return;
  }

  const existing = await opts.storage.getById(payload.sessionId);

  if (!existing) {
    if (!opts.userLimits.acquireSession(data.userId, payload.sessionId)) {
      socket.emit('rejected', { sessionId: payload.sessionId, reason: 'too-many-sessions' });
      return;
    }
    data.acquiredSessions.add(payload.sessionId);

    await opts.storage.createSession({
      sessionId: payload.sessionId,
      matchUpId: payload.matchUpId,
      tournamentId: payload.tournamentId,
      userId: data.userId,
      clientId: payload.clientId,
      formatHint: payload.formatHint,
      currentScore: payload.currentScore,
      crowdScoredBy: resolveAttribution(data, payload.scorer),
    });

    const appended = await opts.storage.appendPoint({
      sessionId: payload.sessionId,
      expectedVersion: 0,
      point: payload.point,
      currentScore: payload.currentScore,
    });
    socket.emit('acked', { sessionId: appended.sessionId, version: appended.version });
    return;
  }

  // Ownership check — a session is bound to the user who created it.
  if (existing.userId !== data.userId) {
    socket.emit('rejected', { sessionId: payload.sessionId, reason: 'not-owner' });
    return;
  }
  if (existing.status !== 'active') {
    socket.emit('rejected', { sessionId: payload.sessionId, reason: `session-${existing.status}` });
    return;
  }

  if (!data.acquiredSessions.has(payload.sessionId)) {
    if (!opts.userLimits.acquireSession(data.userId, payload.sessionId)) {
      socket.emit('rejected', { sessionId: payload.sessionId, reason: 'too-many-sessions' });
      return;
    }
    data.acquiredSessions.add(payload.sessionId);
  }

  try {
    const appended = await opts.storage.appendPoint({
      sessionId: payload.sessionId,
      expectedVersion: payload.expectedVersion ?? existing.version,
      point: payload.point,
      currentScore: payload.currentScore,
    });
    socket.emit('acked', { sessionId: appended.sessionId, version: appended.version });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      socket.emit('rejected', {
        sessionId: payload.sessionId,
        reason: 'version-conflict',
        actualVersion: err.actualVersion,
      });
      return;
    }
    if (err instanceof SessionNotFoundError) {
      socket.emit('rejected', { sessionId: payload.sessionId, reason: 'session-not-found' });
      return;
    }
    throw err;
  }
}

async function handleEnd(
  socket: Socket,
  payload: EndSessionPayload | undefined,
  opts: CrowdNamespaceOptions,
): Promise<void> {
  const data = socket.data as SocketData;
  if (!payload || typeof payload.sessionId !== 'string') {
    const sessionId = (payload as { sessionId?: unknown } | undefined)?.sessionId;
    socket.emit('rejected', { sessionId, reason: 'invalid-payload' });
    return;
  }
  const existing = await opts.storage.getById(payload.sessionId);
  if (!existing) {
    socket.emit('rejected', { sessionId: payload.sessionId, reason: 'session-not-found' });
    return;
  }
  if (existing.userId !== data.userId) {
    socket.emit('rejected', { sessionId: payload.sessionId, reason: 'not-owner' });
    return;
  }
  await opts.storage.cancelSession(payload.sessionId);
  opts.userLimits.releaseSession(data.userId, payload.sessionId);
  data.acquiredSessions.delete(payload.sessionId);
  socket.emit('sessionEnded', { sessionId: payload.sessionId });
}

function extractToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) return auth.token;
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}

function isValidSubmitPayload(payload: unknown): payload is SubmitCrowdScorePayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Partial<SubmitCrowdScorePayload>;
  return (
    typeof p.sessionId === 'string' &&
    typeof p.matchUpId === 'string' &&
    typeof p.tournamentId === 'string' &&
    typeof p.clientId === 'string' &&
    p.point != null &&
    typeof p.point === 'object' &&
    (p.point.winner === 1 || p.point.winner === 2)
  );
}

function resolveAudience(payload: JwtPayload): CrowdAudience {
  // CFS's @Audience([...]) decorator emits 'aud' as string | string[].
  // Prefer 'hiveid' when present (more specific identity claim) so a
  // dual-audience token always exposes the canonical personId path.
  const list = normalizeAudiences(payload.aud);
  if (list.includes('hiveid')) return 'hiveid';
  return 'admin';
}

function resolveAttribution(
  data: SocketData,
  payloadScorer: SubmitCrowdScorePayload['scorer'],
): CrowdScorerAttribution | undefined {
  if (data.audience === 'hiveid') {
    // JWT personId is the source of truth — the client's scorer block
    // is informational, never trusted to override the JWT-attested id.
    return {
      personId: data.personId ?? null,
      displayName: payloadScorer?.displayName ?? data.displayName ?? '',
      audience: 'hiveid',
    };
  }
  if (payloadScorer && typeof payloadScorer.displayName === 'string') {
    return {
      personId: payloadScorer.personId ?? null,
      displayName: payloadScorer.displayName,
      audience: 'admin',
    };
  }
  return undefined;
}
