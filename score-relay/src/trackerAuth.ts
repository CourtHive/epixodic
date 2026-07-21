/**
 * /tracker namespace authentication — IONSport Open Issue #1.
 *
 * Verifies HS256 JWTs presented in the Socket.IO handshake. Accepts
 * tokens with `aud` containing `admin` or `score` (mirrors CFS's
 * audience model). Score-aud tokens MUST carry a `tournamentId`
 * claim so the namespace can reject cross-tournament frames; admin
 * tokens have no such restriction (TD / superuser scope).
 *
 * Reuses the HS256 verifier in `crowd/jwtVerify.ts` so /tracker and
 * /crowd share one trust root — the CFS-issued `JWT_SECRET`.
 */

import type { Socket } from 'socket.io';
import type { KeyObject } from 'node:crypto';
import { verifyJwt, JwtVerificationError, normalizeAudiences } from './crowd/jwtVerify.js';

export type TrackerAudience = 'admin' | 'score';

export interface TrackerSocketData {
  userId: string;
  audience: TrackerAudience;
  /** Required for `score`-aud tokens; undefined for `admin`-aud (TD scope). */
  tournamentId?: string;
}

export class TrackerAuthError extends Error {
  constructor(public readonly reason: string) {
    super(`tracker auth failed: ${reason}`);
    this.name = 'TrackerAuthError';
  }
}

export interface VerifyTrackerOptions {
  /** Override now() for tests, seconds since epoch. */
  now?: number;
  /** ES256 public keys by `kid` (dual-accept during the signing migration). */
  es256Keys?: Map<string, KeyObject>;
}

/**
 * Verify a tracker JWT and return the socket attribution. Throws
 * TrackerAuthError on any failure. Caller decides whether to reject
 * the socket (strict mode) or pass through anonymous (legacy).
 *
 * Dual-accepts ES256 (by `kid`) and legacy HS256 via the shared `verifyJwt`,
 * so `/tracker` and `/crowd` share one trust root through the signing migration.
 */
export function verifyTrackerToken(
  token: string,
  jwtSecret: string,
  options: VerifyTrackerOptions = {},
): TrackerSocketData {
  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(
      token,
      { hsSecret: jwtSecret, es256Keys: options.es256Keys },
      { now: options.now, expectedAudiences: ['admin', 'score'] },
    );
  } catch (err) {
    const reason = err instanceof JwtVerificationError ? err.reason : 'bad-token';
    throw new TrackerAuthError(reason);
  }

  // CFS's admin login tokens use `userId` (no JWT `sub` standard claim).
  // Score-aud tokens minted by /auth/tracker-token use `sub: provider:<id>`.
  // Accept either — both identify the principal for the relay's purposes.
  const userId =
    typeof payload.sub === 'string'
      ? payload.sub
      : typeof payload.userId === 'string'
        ? payload.userId
        : undefined;
  if (!userId) throw new TrackerAuthError('missing-subject');

  const audience = resolveTrackerAudience(payload.aud);

  if (audience === 'score') {
    const tournamentId = typeof payload.tournamentId === 'string' ? payload.tournamentId : undefined;
    if (!tournamentId) throw new TrackerAuthError('missing-tournament-id');
    return { userId, audience, tournamentId };
  }
  return { userId, audience };
}

/**
 * Pick the strongest audience present. `score` wins over `admin`
 * because score-aud tokens are intentionally scope-narrowed and
 * shouldn't get promoted to admin by accident.
 */
export function resolveTrackerAudience(rawAud: unknown): TrackerAudience {
  const list = normalizeAudiences(rawAud);
  if (list.includes('score')) return 'score';
  return 'admin';
}

/**
 * Extract the JWT from a Socket.IO handshake. Looks at `auth.token`
 * first (preferred for socket.io-client), falls back to the
 * `Authorization: Bearer ...` header for parity with the REST API.
 */
export function extractTrackerToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) return auth.token;
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}
