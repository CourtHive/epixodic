import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  JwtVerificationError,
  normalizeAudiences,
  signHs256,
  verifyHs256,
  signEs256,
  verifyEs256,
  verifyJwt,
  loadEs256Keys,
} from './jwtVerify.js';

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

  describe('expectedAudiences', () => {
    it('passes when token aud matches a single allowed audience', () => {
      const token = signHs256({ sub: 'u', aud: 'hiveid' }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: ['hiveid'] })).not.toThrow();
    });

    it('passes when token aud array intersects allowed list', () => {
      const token = signHs256({ sub: 'u', aud: ['admin', 'hiveid'] }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: ['hiveid'] })).not.toThrow();
    });

    it('treats a missing aud as admin for back-compat', () => {
      const token = signHs256({ sub: 'u' }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: ['admin'] })).not.toThrow();
    });

    it('rejects when no audience matches', () => {
      const token = signHs256({ sub: 'u', aud: 'projector' }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: ['admin', 'hiveid'] })).toThrowError(
        /audience-mismatch/,
      );
    });

    it('accepts a CFS scorer token (aud: score) at the /crowd audience set', () => {
      const token = signHs256({ sub: 'u', aud: 'score', personId: 'p-1' }, SECRET);
      expect(() =>
        verifyHs256(token, SECRET, { expectedAudiences: ['admin', 'hiveid', 'provider', 'score'] }),
      ).not.toThrow();
    });

    it('rejects a score token where score is NOT in the expected set (grants nothing elsewhere)', () => {
      const token = signHs256({ sub: 'u', aud: 'score', personId: 'p-1' }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: ['admin', 'hiveid'] })).toThrowError(
        /audience-mismatch/,
      );
    });

    it('skips the check entirely when expectedAudiences is omitted', () => {
      const token = signHs256({ sub: 'u', aud: 'anything-goes' }, SECRET);
      expect(() => verifyHs256(token, SECRET)).not.toThrow();
    });

    it('skips the check when expectedAudiences is an empty array', () => {
      const token = signHs256({ sub: 'u', aud: 'projector' }, SECRET);
      expect(() => verifyHs256(token, SECRET, { expectedAudiences: [] })).not.toThrow();
    });
  });

  describe('normalizeAudiences', () => {
    it('returns [admin] for undefined / null / empty string / empty array', () => {
      expect(normalizeAudiences(undefined)).toEqual(['admin']);
      expect(normalizeAudiences(null)).toEqual(['admin']);
      expect(normalizeAudiences('')).toEqual(['admin']);
      expect(normalizeAudiences([])).toEqual(['admin']);
    });

    it('wraps a single string', () => {
      expect(normalizeAudiences('hiveid')).toEqual(['hiveid']);
    });

    it('returns string[] as-is, filtered to non-empty strings', () => {
      expect(normalizeAudiences(['admin', 'hiveid'])).toEqual(['admin', 'hiveid']);
      expect(normalizeAudiences(['admin', '', 42, 'hiveid'])).toEqual(['admin', 'hiveid']);
    });

    it('returns [] for non-string non-array shapes', () => {
      expect(normalizeAudiences(42)).toEqual([]);
      expect(normalizeAudiences({})).toEqual([]);
    });
  });
});

describe('ES256 dual-accept (signing migration)', () => {
  const KID = 'es256-relay-test';
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const keys = loadEs256Keys({ JWT_PUBLIC_KEY: pubPem, JWT_KID: KID } as NodeJS.ProcessEnv);

  it('verifyEs256 round-trips a token signed with the matching private key + kid', () => {
    const token = signEs256({ sub: 'u-es', aud: 'score', personId: 'p-1' }, privateKey, KID);
    const payload = verifyEs256(token, keys);
    expect(payload.sub).toBe('u-es');
    expect(payload.personId).toBe('p-1');
  });

  it('verifyEs256 rejects an unknown kid (fail-closed)', () => {
    const token = signEs256({ sub: 'u' }, privateKey, 'some-other-kid');
    expect(() => verifyEs256(token, keys)).toThrowError(/unknown-key/);
  });

  it('verifyEs256 rejects a tampered payload', () => {
    const token = signEs256({ sub: 'u', roles: ['client'] }, privateKey, KID);
    const [h, , s] = token.split('.');
    const evilBody = Buffer.from(JSON.stringify({ sub: 'u', roles: ['admin'] }), 'utf-8')
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(() => verifyEs256(`${h}.${evilBody}.${s}`, keys)).toThrowError(/bad-signature/);
  });

  it('verifyEs256 verified with the WRONG keypair fails', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const otherKeys = loadEs256Keys({
      JWT_PUBLIC_KEY: other.publicKey.export({ type: 'spki', format: 'pem' }) as string,
      JWT_KID: KID,
    } as NodeJS.ProcessEnv);
    const token = signEs256({ sub: 'u' }, privateKey, KID);
    expect(() => verifyEs256(token, otherKeys)).toThrowError(/bad-signature/);
  });

  it('verifyJwt dispatches ES256 and HS256 by header alg', () => {
    const es = signEs256({ sub: 'u-es' }, privateKey, KID);
    const hs = signHs256({ sub: 'u-hs' }, SECRET);
    expect(verifyJwt(es, { hsSecret: SECRET, es256Keys: keys }).sub).toBe('u-es');
    expect(verifyJwt(hs, { hsSecret: SECRET, es256Keys: keys }).sub).toBe('u-hs');
  });

  it('verifyJwt rejects alg:none (downgrade guard)', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'attacker' })}.`;
    expect(() => verifyJwt(none, { hsSecret: SECRET, es256Keys: keys })).toThrowError(/unsupported-algorithm/);
  });

  it('verifyJwt rejects an ES256 token when no ES256 keys are configured', () => {
    const token = signEs256({ sub: 'u' }, privateKey, KID);
    expect(() => verifyJwt(token, { hsSecret: SECRET })).toThrowError(/es256-unavailable/);
  });

  it('verifyJwt still verifies HS256 when only the secret is configured', () => {
    const hs = signHs256({ sub: 'u-hs' }, SECRET);
    expect(verifyJwt(hs, { hsSecret: SECRET }).sub).toBe('u-hs');
  });

  it('verifyJwt rejects HS256 (but keeps ES256) once JWT_ACCEPT_HS256=false (step 4 toggle)', () => {
    process.env.JWT_ACCEPT_HS256 = 'false';
    try {
      const hs = signHs256({ sub: 'u-hs' }, SECRET);
      expect(() => verifyJwt(hs, { hsSecret: SECRET, es256Keys: keys })).toThrowError(/hs256-disabled/);
      const es = signEs256({ sub: 'u-es' }, privateKey, KID);
      expect(verifyJwt(es, { hsSecret: SECRET, es256Keys: keys }).sub).toBe('u-es');
    } finally {
      delete process.env.JWT_ACCEPT_HS256;
    }
  });

  describe('loadEs256Keys', () => {
    it('returns an empty map when unconfigured', () => {
      expect(loadEs256Keys({} as NodeJS.ProcessEnv).size).toBe(0);
    });

    it('loads current + previous keys and tolerates literal \\n in the PEM', () => {
      const escaped = pubPem.trim().replace(/\n/g, '\\n');
      const prev = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const loaded = loadEs256Keys({
        JWT_PUBLIC_KEY: escaped,
        JWT_KID: 'k-new',
        JWT_PUBLIC_KEY_PREVIOUS: prev.publicKey.export({ type: 'spki', format: 'pem' }) as string,
        JWT_KID_PREVIOUS: 'k-old',
      } as NodeJS.ProcessEnv);
      expect([...loaded.keys()].sort()).toEqual(['k-new', 'k-old']);
    });

    it('skips an unparseable key rather than throwing', () => {
      const loaded = loadEs256Keys({ JWT_PUBLIC_KEY: 'not-a-pem', JWT_KID: 'bad' } as NodeJS.ProcessEnv);
      expect(loaded.size).toBe(0);
    });
  });
});
