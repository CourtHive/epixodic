/**
 * Native HS256 JWT verifier — Phase 3 slice 2.
 *
 * Score-relay never issues JWTs — those come from
 * competition-factory-server's `/auth/login`. We just verify signature
 * and expiry using the shared `JWT_SECRET`. Native node:crypto keeps
 * the dep footprint at zero (no jsonwebtoken).
 *
 * Algorithm: HS256 only. Tokens signed by competition-factory-server's
 * @nestjs/jwt default. Token format: `header.payload.signature`
 * (base64url-encoded, no padding, '-'/'_' alphabet).
 *
 * Exported `signHs256` is for tests — production score-relay never
 * mints tokens.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  /** Subject — typically the user id. */
  sub?: string;
  /** Expiry, seconds since the epoch. */
  exp?: number;
  /** Not-before, seconds since the epoch. */
  nbf?: number;
  /** Issued-at, seconds since the epoch. */
  iat?: number;
  /** Email or any other CFS-attached claims. */
  [key: string]: unknown;
}

export class JwtVerificationError extends Error {
  constructor(public readonly reason: string) {
    super(`jwt verification failed: ${reason}`);
    this.name = 'JwtVerificationError';
  }
}

export interface VerifyOptions {
  /** Override current time (seconds since epoch). Defaults to Date.now()/1000. */
  now?: number;
  /** Tolerance in seconds for `exp`/`nbf` checks. Default 0. */
  clockSkewSeconds?: number;
  /**
   * If set, `payload.aud` must include at least one of these strings.
   * CFS's `@Audience([...])` decorator emits `aud` as either a string or
   * a string[] depending on how many audiences it was minted for. We
   * normalize both shapes and pass if the intersection is non-empty.
   * Legacy unaudienced tokens (no `aud` claim) are treated as `'admin'`
   * for back-compat with in-flight admin sessions, matching CFS's
   * AuthGuard default.
   */
  expectedAudiences?: string[];
}

export function verifyHs256(token: string, secret: string, options: VerifyOptions = {}): JwtPayload {
  if (!secret) throw new JwtVerificationError('secret-required');
  if (typeof token !== 'string' || token.length === 0) {
    throw new JwtVerificationError('token-required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtVerificationError('malformed-token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = parseJsonSegment(headerB64, 'header');
  if (header.alg !== 'HS256') {
    throw new JwtVerificationError(`unsupported-algorithm:${String(header.alg)}`);
  }
  if (header.typ && header.typ !== 'JWT') {
    throw new JwtVerificationError(`unsupported-type:${String(header.typ)}`);
  }

  const expectedSig = hmacSha256Base64Url(`${headerB64}.${payloadB64}`, secret);
  if (!constantTimeEqualStrings(expectedSig, signatureB64)) {
    throw new JwtVerificationError('bad-signature');
  }

  const payload = parseJsonSegment(payloadB64, 'payload') as JwtPayload;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 0;

  if (typeof payload.exp === 'number' && payload.exp + skew < now) {
    throw new JwtVerificationError('expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - skew > now) {
    throw new JwtVerificationError('not-yet-valid');
  }

  if (options.expectedAudiences && options.expectedAudiences.length > 0) {
    const tokenAudiences = normalizeAudiences(payload.aud);
    const intersects = options.expectedAudiences.some((a) => tokenAudiences.includes(a));
    if (!intersects) throw new JwtVerificationError('audience-mismatch');
  }

  return payload;
}

/**
 * Normalize the JWT `aud` claim into a list:
 *   undefined / empty array / empty string → ['admin'] (legacy back-compat)
 *   string                                  → [string]
 *   string[]                                → as-is (filtered to non-empty)
 *   anything else                           → []
 */
export function normalizeAudiences(raw: unknown): string[] {
  if (raw === undefined || raw === null) return ['admin'];
  if (typeof raw === 'string') return raw.length === 0 ? ['admin'] : [raw];
  if (Array.isArray(raw)) {
    const filtered = raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
    return filtered.length === 0 ? ['admin'] : filtered;
  }
  return [];
}

/**
 * Test-only helper to mint HS256 tokens. Production score-relay never calls this.
 */
export function signHs256(payload: JwtPayload, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSha256Base64Url(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

function parseJsonSegment(segment: string, label: string): Record<string, unknown> {
  let json: string;
  try {
    json = Buffer.from(toBase64(segment), 'base64').toString('utf-8');
  } catch {
    throw new JwtVerificationError(`malformed-${label}`);
  }
  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not-an-object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new JwtVerificationError(`malformed-${label}`);
  }
}

function hmacSha256Base64Url(data: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(data).digest();
  return base64UrlEncodeBuffer(sig);
}

function base64UrlEncode(data: string): string {
  return base64UrlEncodeBuffer(Buffer.from(data, 'utf-8'));
}

function base64UrlEncodeBuffer(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function toBase64(base64UrlSegment: string): string {
  // Reverse base64url: '-' -> '+', '_' -> '/', restore padding to length % 4 === 0.
  let s = base64UrlSegment.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = s.length % 4;
  if (remainder === 2) s += '==';
  else if (remainder === 3) s += '=';
  else if (remainder === 1) throw new JwtVerificationError('malformed-token');
  return s;
}

function constantTimeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
