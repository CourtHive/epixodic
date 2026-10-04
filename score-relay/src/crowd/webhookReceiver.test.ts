/**
 * Webhook receiver tests. Drives the handler with stub IncomingMessage /
 * ServerResponse objects backed by tiny EventEmitters — no real HTTP server.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { Pool } from 'pg';
import { runMigrations } from './migrationRunner.js';
import { CrowdScoringStorage } from './storage.js';
import { createMatchUpFinalizedHandler } from './webhookReceiver.js';

const TEST_URL = process.env.CROWD_POSTGRES_URL_TEST;
const suite = TEST_URL ? describe : describe.skip;

const SECRET = 'test-internal-secret-abc';

interface FakeRequest extends EventEmitter {
  method?: string;
  headers: Record<string, string | undefined>;
  destroy: () => void;
}

interface FakeResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body?: string) => void;
}

function makeRequest(method: string, headers: Record<string, string | undefined>, body?: unknown): FakeRequest {
  const emitter: FakeRequest = Object.assign(new EventEmitter(), {
    method,
    headers,
    destroy: () => undefined,
  });
  queueMicrotask(() => {
    if (body !== undefined) {
      emitter.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    emitter.emit('end');
  });
  return emitter;
}

function makeResponse(): FakeResponse {
  const res: FakeResponse = {
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers;
    },
    end(body) {
      res.body = body;
    },
  };
  return res;
}

suite('matchUpFinalized webhook handler', () => {
  let pool: Pool;
  let storage: CrowdScoringStorage;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await runMigrations(pool, { logger: () => {} });
    storage = new CrowdScoringStorage(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE crowd.crowd_scoring_sessions');
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('GET', { 'x-internal-secret': SECRET });
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 when the secret header is missing', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', {}, { matchUpId: 'mu-x' });
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the secret is wrong', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', { 'x-internal-secret': 'wrong' }, { matchUpId: 'mu-x' });
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when matchUpId is missing', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', { 'x-internal-secret': SECRET }, {});
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('matchUpId-required');
  });

  it('returns 400 on invalid JSON', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', { 'x-internal-secret': SECRET }, 'not-json{');
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('cancels active sessions for the matchUp and returns the count', async () => {
    await storage.createSession({
      sessionId: `s1-${Math.random().toString(36).slice(2, 8)}`,
      matchUpId: 'mu-final',
      tournamentId: 'tour-1',
      userId: 'user-a',
      clientId: 'client-a',
      currentScore: {},
    });
    await storage.createSession({
      sessionId: `s2-${Math.random().toString(36).slice(2, 8)}`,
      matchUpId: 'mu-final',
      tournamentId: 'tour-1',
      userId: 'user-b',
      clientId: 'client-b',
      currentScore: {},
    });
    await storage.createSession({
      sessionId: `s3-${Math.random().toString(36).slice(2, 8)}`,
      matchUpId: 'mu-other',
      tournamentId: 'tour-1',
      userId: 'user-c',
      clientId: 'client-c',
      currentScore: {},
    });

    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', { 'x-internal-secret': SECRET }, { matchUpId: 'mu-final' });
    const res = makeResponse();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"cancelled":2');

    const stillActive = await storage.getByMatchUpId('mu-final', { activeOnly: true });
    expect(stillActive).toHaveLength(0);
    const otherStillActive = await storage.getByMatchUpId('mu-other', { activeOnly: true });
    expect(otherStillActive).toHaveLength(1);
  });

  it('returns 200 with cancelled:0 when no sessions exist for the matchUp', async () => {
    const handler = createMatchUpFinalizedHandler({ storage, secret: SECRET, logger: () => {} });
    const req = makeRequest('POST', { 'x-internal-secret': SECRET }, { matchUpId: 'mu-nonexistent' });
    const res = makeResponse();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"cancelled":0');
  });
});

describe('createMatchUpFinalizedHandler — pure validation', () => {
  it('throws when secret is empty', () => {
    expect(() =>
      createMatchUpFinalizedHandler({
        storage: {} as unknown as CrowdScoringStorage,
        secret: '',
      }),
    ).toThrow(/secret is required/);
  });
});
