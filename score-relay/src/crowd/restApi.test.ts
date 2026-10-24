import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Pool } from 'pg';
import { runMigrations } from './migrationRunner.js';
import { CrowdScoringStorage } from './storage.js';
import { createCrowdRestApi } from './restApi.js';
import { signHs256 } from './jwtVerify.js';

const TEST_URL = process.env.CROWD_POSTGRES_URL_TEST;
const suite = TEST_URL ? describe : describe.skip;

const JWT_SECRET = 'crowd-rest-test-secret';

function bearer(sub: string): string {
  return `Bearer ${signHs256({ sub }, JWT_SECRET)}`;
}

interface FakeReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
}
interface FakeRes {
  status?: number;
  body?: string;
  writeHead: (s: number, h?: Record<string, string>) => void;
  end: (b?: string) => void;
}

function req(method: string, url: string, headers: Record<string, string | undefined> = {}): FakeReq {
  const e = Object.assign(new EventEmitter(), { method, url, headers }) as FakeReq;
  queueMicrotask(() => e.emit('end'));
  return e;
}

function res(): FakeRes {
  const r: FakeRes = {
    writeHead: (s, _h) => {
      r.status = s;
    },
    end: (b) => {
      r.body = b;
    },
  };
  return r;
}

function parseBody(r: FakeRes): any {
  return r.body ? JSON.parse(r.body) : undefined;
}

suite('crowd REST API', () => {
  let pool: Pool;
  let storage: CrowdScoringStorage;
  let api: ReturnType<typeof createCrowdRestApi>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await runMigrations(pool, { logger: () => {} });
    storage = new CrowdScoringStorage(pool);
    api = createCrowdRestApi({ storage, jwtSecret: JWT_SECRET, logger: () => {} });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE crowd.crowd_scoring_sessions');
  });

  async function seed(matchUpId: string, tournamentId = 'tour-1', userId = 'user-a') {
    return storage.createSession({
      sessionId: `s-${matchUpId}-${Math.random().toString(36).slice(2, 8)}`,
      matchUpId,
      tournamentId,
      userId,
      clientId: 'client-fp',
      currentScore: {},
    });
  }

  it('route() returns false for unrelated paths', async () => {
    const r = res();
    const handled = await api.route(req('GET', '/metrics') as any, r as any);
    expect(handled).toBe(false);
  });

  it('returns 401 without a bearer token', async () => {
    const r = res();
    await api.route(req('GET', '/api/crowd-sessions?matchUpId=mu-1') as any, r as any);
    expect(r.status).toBe(401);
    expect(parseBody(r).error).toMatch(/bearer/);
  });

  it('returns 401 with a bad token', async () => {
    const r = res();
    await api.route(
      req('GET', '/api/crowd-sessions?matchUpId=mu-1', { authorization: 'Bearer not.a.jwt' }) as any,
      r as any,
    );
    expect(r.status).toBe(401);
  });

  it('GET ?matchUpId=... returns sessions for the matchUp', async () => {
    const a = await seed('mu-A');
    await seed('mu-B');

    const r = res();
    await api.route(
      req('GET', '/api/crowd-sessions?matchUpId=mu-A', { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(200);
    const body = parseBody(r);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBe(a.sessionId);
  });

  it('GET ?tournamentId=...&activeOnly=true returns only active sessions', async () => {
    const active = await seed('mu-X', 'tour-Z');
    const cancelled = await seed('mu-Y', 'tour-Z');
    await storage.cancelSession(cancelled.sessionId);

    const r = res();
    await api.route(
      req('GET', '/api/crowd-sessions?tournamentId=tour-Z&activeOnly=true', {
        authorization: bearer('td-bob'),
      }) as any,
      r as any,
    );
    expect(r.status).toBe(200);
    const body = parseBody(r);
    expect(body.sessions.map((s: any) => s.sessionId)).toEqual([active.sessionId]);
  });

  it('GET without matchUpId or tournamentId returns 400', async () => {
    const r = res();
    await api.route(req('GET', '/api/crowd-sessions', { authorization: bearer('td-bob') }) as any, r as any);
    expect(r.status).toBe(400);
  });

  it('POST /:sessionId/promote marks the session trusted', async () => {
    const seeded = await seed('mu-P');

    const r = res();
    await api.route(
      req('POST', `/api/crowd-sessions/${seeded.sessionId}/promote`, { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(200);
    const body = parseBody(r);
    expect(body.session.trusted).toBe(true);
    expect(body.session.trustedBy).toBe('td-bob');
  });

  it('POST /:sessionId/demote clears trusted', async () => {
    const seeded = await seed('mu-D');
    await storage.promote(seeded.sessionId, 'td-bob');

    const r = res();
    await api.route(
      req('POST', `/api/crowd-sessions/${seeded.sessionId}/demote`, { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(200);
    const body = parseBody(r);
    expect(body.session.trusted).toBe(false);
    expect(body.session.trustedBy).toBeUndefined();
  });

  it('POST /:sessionId/promote returns 404 for unknown session', async () => {
    const r = res();
    await api.route(
      req('POST', '/api/crowd-sessions/sess-missing/promote', { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(404);
  });

  it('DELETE /:sessionId cancels the session', async () => {
    const seeded = await seed('mu-DEL');

    const r = res();
    await api.route(
      req('DELETE', `/api/crowd-sessions/${seeded.sessionId}`, { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(200);

    const after = await storage.getById(seeded.sessionId);
    expect(after?.status).toBe('cancelled-by-user');
  });

  it('DELETE /:sessionId returns 404 when already cancelled', async () => {
    const seeded = await seed('mu-DEL2');
    await storage.cancelSession(seeded.sessionId);

    const r = res();
    await api.route(
      req('DELETE', `/api/crowd-sessions/${seeded.sessionId}`, { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(404);
  });

  it('unknown sub-path returns 404', async () => {
    const r = res();
    await api.route(
      req('GET', '/api/crowd-sessions/sess-X/wat', { authorization: bearer('td-bob') }) as any,
      r as any,
    );
    expect(r.status).toBe(404);
  });
});

describe('createCrowdRestApi — pure validation', () => {
  it('throws when jwtSecret is missing', () => {
    expect(() =>
      createCrowdRestApi({ storage: {} as unknown as CrowdScoringStorage, jwtSecret: '' }),
    ).toThrow(/jwtSecret/);
  });
});

suite('crowd REST API → /live fan-out', () => {
  let pool: Pool;
  let storage: CrowdScoringStorage;
  const fanout = { publish: vi.fn(), retract: vi.fn() };
  let api: ReturnType<typeof createCrowdRestApi>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await runMigrations(pool, { logger: () => {} });
    storage = new CrowdScoringStorage(pool);
    api = createCrowdRestApi({ storage, jwtSecret: JWT_SECRET, fanout, logger: () => {} });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE crowd.crowd_scoring_sessions');
    fanout.publish.mockClear();
    fanout.retract.mockClear();
  });

  const seed = (matchUpId: string) =>
    storage.createSession({
      sessionId: `s-${matchUpId}`,
      matchUpId,
      tournamentId: 'tour-1',
      userId: 'user-a',
      clientId: 'client-fp',
      currentScore: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] },
    });

  const call = async (method: string, path: string) => {
    const r = res();
    await api.route(req(method, path, { authorization: bearer('td-bob') }) as any, r as any);
    return r;
  };

  it('promote hands the now-trusted session to the fan-out', async () => {
    await seed('mu-F1');
    const r = await call('POST', '/api/crowd-sessions/s-mu-F1/promote');
    expect(r.status).toBe(200);
    expect(fanout.publish).toHaveBeenCalledTimes(1);
    expect(fanout.publish.mock.calls[0][0]).toMatchObject({ sessionId: 's-mu-F1', trusted: true });
  });

  it('demote and cancel retract the session from /live', async () => {
    await seed('mu-F2');
    await storage.promote('s-mu-F2', 'td-bob');
    expect((await call('POST', '/api/crowd-sessions/s-mu-F2/demote')).status).toBe(200);
    expect(fanout.retract).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 's-mu-F2' }));

    await seed('mu-F3');
    expect((await call('DELETE', '/api/crowd-sessions/s-mu-F3')).status).toBe(200);
    expect(fanout.retract).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 's-mu-F3' }));
    expect(fanout.publish).not.toHaveBeenCalled();
  });

  it('a failed promote publishes nothing', async () => {
    expect((await call('POST', '/api/crowd-sessions/no-such-session/promote')).status).toBe(404);
    expect(fanout.publish).not.toHaveBeenCalled();
  });
});
