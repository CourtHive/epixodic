/**
 * Light integration test: POST /auth/login returns a valid JWT with the score role.
 *
 * Requires the competition-factory-server running locally on port 8383
 * with APP_MODE=development (enables the built-in dev user).
 *
 * Skips gracefully if the server is not reachable.
 */
import { describe, it, expect } from 'vitest';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

// Node test runtime — vitest exposes process via globalThis
const SERVER_URL = (globalThis as any).process?.env?.VITE_SERVER_URL || 'http://localhost:8383';
const DEV_USER = { email: 'axel@castle.com', password: 'castle' };

async function serverReachable(): Promise<boolean> {
  try {
    await axios.get(SERVER_URL, { timeout: 2000 });
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

  it('JWT contains the score role', async () => {
    const res = await axios.post(`${SERVER_URL}/auth/login`, DEV_USER);
    const decoded: any = jwtDecode(res.data.token);

    expect(decoded.roles).toBeDefined();
    expect(decoded.roles).toContain('score');
  });

  it('JWT contains expected claims', async () => {
    const res = await axios.post(`${SERVER_URL}/auth/login`, DEV_USER);
    const decoded: any = jwtDecode(res.data.token);

    expect(decoded.email).toBe(DEV_USER.email);
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    expect(decoded.roles).toContain('superadmin');
    expect(decoded.roles).toContain('client');
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
