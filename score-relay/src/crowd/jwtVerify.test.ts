import { describe, expect, it } from 'vitest';
import { JwtVerificationError, signHs256, verifyHs256 } from './jwtVerify.js';

const SECRET = 'test-shared-secret';

describe('jwtVerify', () => {
  it('roundtrips sign → verify with payload claims intact', () => {
    const token = signHs256({ sub: 'user-alice', email: 'alice@example.com', iat: 1234567890 }, SECRET);
    const payload = verifyHs256(token, SECRET);
    expect(payload.sub).toBe('user-alice');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.iat).toBe(1234567890);
  });

  it('rejects a tampered payload', () => {
    const original = signHs256({ sub: 'user-alice' }, SECRET);
    const [header, , signature] = original.split('.');
    const tampered = `${header}.${Buffer.from(JSON.stringify({ sub: 'evil' }), 'utf-8').toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${signature}`;
    expect(() => verifyHs256(tampered, SECRET)).toThrowError(JwtVerificationError);
  });

  it('rejects when signed with a different secret', () => {
    const token = signHs256({ sub: 'user-alice' }, SECRET);
    expect(() => verifyHs256(token, 'different-secret')).toThrowError(/bad-signature/);
  });

  it('rejects an expired token', () => {
    const token = signHs256({ sub: 'user-alice', exp: 1_000 }, SECRET);
    expect(() => verifyHs256(token, SECRET, { now: 2_000 })).toThrowError(/expired/);
  });

  it('respects clockSkewSeconds tolerance', () => {
    const token = signHs256({ sub: 'user-alice', exp: 1_000 }, SECRET);
    expect(() => verifyHs256(token, SECRET, { now: 1_005, clockSkewSeconds: 30 })).not.toThrow();
  });

  it('rejects not-yet-valid tokens', () => {
    const token = signHs256({ sub: 'user-alice', nbf: 5_000 }, SECRET);
    expect(() => verifyHs256(token, SECRET, { now: 4_999 })).toThrowError(/not-yet-valid/);
  });

  it('rejects unsupported algorithms', () => {
    // Manually construct an RS256 header to exercise the alg-check
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }), 'utf-8')
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const payload = Buffer.from(JSON.stringify({ sub: 'x' }), 'utf-8')
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(() => verifyHs256(`${header}.${payload}.sig`, SECRET)).toThrowError(/unsupported-algorithm/);
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyHs256('not.a.jwt.too-many-parts', SECRET)).toThrowError(/malformed-token/);
    expect(() => verifyHs256('only.two', SECRET)).toThrowError(/malformed-token/);
    expect(() => verifyHs256('', SECRET)).toThrowError(/token-required/);
  });

  it('throws when secret is empty', () => {
    expect(() => verifyHs256(signHs256({ sub: 'x' }, SECRET), '')).toThrowError(/secret-required/);
  });
});
