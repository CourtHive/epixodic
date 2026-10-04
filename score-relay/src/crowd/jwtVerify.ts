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

import {
  createHmac,
  timingSafeEqual,
  createPublicKey,
  verify as cryptoVerify,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';

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
  return checkClaims(payload, options);
}

/**
 * Temporal (`exp`/`nbf`) + audience validation shared by the HS256 and ES256
 * verifiers, so both enforce identical claim policy.
 */
function checkClaims(payload: JwtPayload, options: VerifyOptions): JwtPayload {
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
 * ES256 verifier — Phase 1 signing decoupling
 * (Mentat/planning/JWT_SIGNING_AUTHORITY_DECOUPLING.md, step 2).
 *
 * Verifies an ES256 JWT against the public key resolved by its `kid` header.
 * JWT ES256 signatures are raw r||s (IEEE-P1363), so `dsaEncoding` is pinned
 * accordingly (node's default expects DER). Fail-closed: an absent/unknown kid
 * or a missing key rejects — the verifier never falls back to a weaker check.
 */
export function verifyEs256(
  token: string,
  publicKeys: Map<string, KeyObject>,
  options: VerifyOptions = {},
): JwtPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new JwtVerificationError('token-required');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtVerificationError('malformed-token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = parseJsonSegment(headerB64, 'header');
  if (header.alg !== 'ES256') {
    throw new JwtVerificationError(`unsupported-algorithm:${String(header.alg)}`);
  }
  if (header.typ && header.typ !== 'JWT') {
    throw new JwtVerificationError(`unsupported-type:${String(header.typ)}`);
  }
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const key = kid ? publicKeys.get(kid) : undefined;
  if (!key) throw new JwtVerificationError('unknown-key');

  let signature: Buffer;
  try {
    signature = Buffer.from(toBase64(signatureB64), 'base64');
  } catch {
    throw new JwtVerificationError('malformed-token');
  }
  const data = Buffer.from(`${headerB64}.${payloadB64}`);
  let ok = false;
  try {
    ok = cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    ok = false;
  }
  if (!ok) throw new JwtVerificationError('bad-signature');

  const payload = parseJsonSegment(payloadB64, 'payload') as JwtPayload;
  return checkClaims(payload, options);
}

/** Verify keys for the dual-accept dispatcher. */
export interface DualAcceptKeys {
  /** Legacy shared HS256 secret (CFS `JWT_SECRET`). */
  hsSecret?: string;
  /** ES256 public keys by `kid` (from `loadEs256Keys`). */
  es256Keys?: Map<string, KeyObject>;
}

/**
 * Dual-accept verifier for the HS256 → ES256 migration: dispatch by the token's
 * `alg` header — ES256 against the JWKS public keys, HS256 against the legacy
 * secret — and hard-reject `alg: none` / any other algorithm (downgrade guard).
 * Mirrors the CFS-side `verifyJwt` so both trust roots enforce one policy.
 */
export function verifyJwt(token: string, keys: DualAcceptKeys, options: VerifyOptions = {}): JwtPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new JwtVerificationError('token-required');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtVerificationError('malformed-token');

  const header = parseJsonSegment(parts[0], 'header');
  if (header.alg === 'ES256') {
    if (!keys.es256Keys || keys.es256Keys.size === 0) {
      throw new JwtVerificationError('es256-unavailable');
    }
    return verifyEs256(token, keys.es256Keys, options);
  }
  if (header.alg === 'HS256') {
    // Step 4 drain toggle: once ES256 tokens have drained in, JWT_ACCEPT_HS256=false
    // rejects the legacy algorithm entirely (reversible config, symmetric with CFS).
    if (process.env.JWT_ACCEPT_HS256 === 'false') throw new JwtVerificationError('hs256-disabled');
    if (!keys.hsSecret) throw new JwtVerificationError('secret-required');
    return verifyHs256(token, keys.hsSecret, options);
  }
  throw new JwtVerificationError(`unsupported-algorithm:${String(header.alg)}`);
}

/**
 * Load ES256 public verify keys from the environment (the relay shares CFS's
 * `.env` via ecosystem.config.js, so it reads the same `JWT_PUBLIC_KEY`/`JWT_KID`
 * the signer publishes — no JWKS HTTP fetch needed while co-located; that
 * becomes the upgrade when the signer moves to a remote service). Tolerates
 * literal `\n` in PEM env values. Returns an empty map when unconfigured
 * (dual-accept then falls through to HS256).
 */
export function loadEs256Keys(env: NodeJS.ProcessEnv = process.env): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const add = (pem?: string, kid?: string): void => {
    if (!pem || !kid) return;
    try {
      keys.set(kid, createPublicKey(pem.replace(/\\n/g, '\n')));
    } catch {
      // Skip an unparseable key rather than crashing the relay; HS256 still works.
    }
  };
  add(env.JWT_PUBLIC_KEY, env.JWT_KID);
  add(env.JWT_PUBLIC_KEY_PREVIOUS, env.JWT_KID_PREVIOUS);
  return keys;
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

/**
 * Test-only helper to mint ES256 tokens (raw r||s signature). Production
 * score-relay never mints — the signer is competition-factory-server.
 */
export function signEs256(payload: JwtPayload, privateKey: KeyObject, kid: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = cryptoSign('sha256', Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${body}.${base64UrlEncodeBuffer(signature)}`;
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
