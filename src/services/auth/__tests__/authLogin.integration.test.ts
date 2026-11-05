/**
 * Light integration test: POST /auth/login returns a valid JWT.
 *
 * Login belongs to the identity provider (courthive-hiveid, :3140 locally). Requires it running, with the local
 * super-admin that `Mentat/scripts/local/seed-local.mjs` creates (override with E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD).
 *
 * Skips gracefully if the server is not reachable.
 */
import { describe, it, expect } from 'vitest';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

// Node test runtime — vitest exposes process via globalThis
const env = (globalThis as any).process?.env ?? {};
const SERVER_URL = env.VITE_AUTH_SERVER_URL || 'http://localhost:3140';
const DEV_USER = {
  email: env.E2E_AUTH_EMAIL || 'super@courthive.local',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- seed-local.mjs's published, local-only fixture password
  password: env.E2E_AUTH_PASSWORD || 'courthive',
};

async function serverReachable(): Promise<boolean> {
  try {
    await axios.get(`${SERVER_URL}/health`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

describe('POST /auth/login (integration)', async () => {
  const available = await serverReachable();

  if (!available) {
    it('skips — server not reachable at ' + SERVER_URL, () => {
      console.log('[auth integration] server not reachable — skipping live tests');
      expect(available).toBe(false);
    });
    return;
  }

  it('returns 200 with a JWT token', async () => {
    const res = await axios.post(`${SERVER_URL}/auth/login`, DEV_USER);

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('token');
    expect(typeof res.data.token).toBe('string');
  });

  it('JWT contains expected claims', async () => {
    const res = await axios.post(`${SERVER_URL}/auth/login`, DEV_USER);
    const decoded: any = jwtDecode(res.data.token);

    expect(decoded.email).toBe(DEV_USER.email);
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    expect(decoded.roles).toContain('superadmin');
  });

  it('rejects invalid credentials with 401', async () => {
    try {
      await axios.post(`${SERVER_URL}/auth/login`, {
        email: 'nobody@nowhere.com',
        password: 'wrong',
      });
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(401);
    }
  });
});
