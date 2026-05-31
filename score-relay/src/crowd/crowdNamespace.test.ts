/**
 * /crowd namespace integration tests. Spins up an in-process Socket.IO
 * server bound to a random port, attaches the namespace, and drives it
 * with a real socket.io-client. Requires CROWD_POSTGRES_URL_TEST.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as IoServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Pool } from 'pg';
import { runMigrations } from './migrationRunner.js';
import { CrowdScoringStorage } from './storage.js';
import { UserLimits } from './userLimits.js';
import { attachCrowdNamespace } from './crowdNamespace.js';
import { signHs256 } from './jwtVerify.js';
import type { CrowdPoint } from './types.js';

const TEST_URL = process.env.CROWD_POSTGRES_URL_TEST;
const suite = TEST_URL ? describe : describe.skip;

const JWT_SECRET = 'crowd-namespace-test-secret';

function mkToken(sub: string, extra: Record<string, unknown> = {}): string {
  return signHs256({ sub, ...extra }, JWT_SECRET);
}

function mkPoint(winner: 1 | 2 = 1): CrowdPoint {
  return { winner, recordedAt: new Date().toISOString() };
}

async function nextEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 1500): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

suite('/crowd namespace', () => {
  let pool: Pool;
  let storage: CrowdScoringStorage;
  let limits: UserLimits;
  let httpServer: HttpServer;
  let io: IoServer;
  let port: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await runMigrations(pool, { logger: () => {} });
    storage = new CrowdScoringStorage(pool);

    httpServer = createServer();
    io = new IoServer(httpServer);
    port = await new Promise<number>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
      });
    });
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE crowd.crowd_scoring_sessions');
    limits = new UserLimits({ eventsPerSecond: 5, maxConcurrentSessions: 3 });
    attachCrowdNamespace({ io, storage, userLimits: limits, jwtSecret: JWT_SECRET, logger: () => {} });
  });

  function connect(token: string | undefined): ClientSocket {
    return ioClient(`http://localhost:${port}/crowd`, {
      auth: token ? { token } : {},
      reconnection: false,
      transports: ['websocket'],
    });
  }

  it('rejects connection without a token', async () => {
    const client = connect(undefined);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/missing-token/);
    client.disconnect();
  });

  it('rejects connection with an unsigned token', async () => {
    const client = connect('not.a.jwt');
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/malformed-|bad-signature/);
    client.disconnect();
  });

  it('rejects an expired token', async () => {
    const expired = signHs256({ sub: 'u-stale', exp: 1 }, JWT_SECRET);
    const client = connect(expired);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/expired/);
    client.disconnect();
  });

  it('auto-creates a session on first submitCrowdScore and acks v=1', async () => {
    const client = connect(mkToken('user-alice'));
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-1',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: { pointDisplay: ['15', '0'] as [string, string] },
    });

    const acked = await nextEvent<{ sessionId: string; version: number }>(client, 'acked');
    expect(acked.sessionId).toBe('sess-1');
    expect(acked.version).toBe(1);

    const persisted = await storage.getById('sess-1');
    expect(persisted?.userId).toBe('user-alice');
    expect(persisted?.pointHistory).toHaveLength(1);

    client.disconnect();
  });

  it('appends subsequent points with optimistic version', async () => {
    const client = connect(mkToken('user-alice'));
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-2',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    let acked = await nextEvent<{ sessionId: string; version: number }>(client, 'acked');
    expect(acked.version).toBe(1);

    client.emit('submitCrowdScore', {
      sessionId: 'sess-2',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(2),
      currentScore: {},
      expectedVersion: 1,
    });
    acked = await nextEvent<{ sessionId: string; version: number }>(client, 'acked');
    expect(acked.version).toBe(2);

    client.disconnect();
  });

  it('rejects when the expectedVersion is stale', async () => {
    const client = connect(mkToken('user-alice'));
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-3',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    await nextEvent(client, 'acked');

    client.emit('submitCrowdScore', {
      sessionId: 'sess-3',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(2),
      currentScore: {},
      expectedVersion: 0, // stale (current is 1)
    });
    const rejected = await nextEvent<{ reason: string }>(client, 'rejected');
    expect(rejected.reason).toBe('version-conflict');

    client.disconnect();
  });

  it('refuses to score on a session owned by a different user', async () => {
    const alice = connect(mkToken('user-alice'));
    await new Promise<void>((resolve) => alice.on('connect', resolve));
    alice.emit('submitCrowdScore', {
      sessionId: 'sess-shared',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    await nextEvent(alice, 'acked');
    alice.disconnect();

    const bob = connect(mkToken('user-bob'));
    await new Promise<void>((resolve) => bob.on('connect', resolve));
    bob.emit('submitCrowdScore', {
      sessionId: 'sess-shared',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-2',
      point: mkPoint(2),
      currentScore: {},
      expectedVersion: 1,
    });
    const rejected = await nextEvent<{ reason: string }>(bob, 'rejected');
    expect(rejected.reason).toBe('not-owner');
    bob.disconnect();
  });

  it('endSession transitions to cancelled-by-user', async () => {
    const client = connect(mkToken('user-alice'));
    await new Promise<void>((resolve) => client.on('connect', resolve));
    client.emit('submitCrowdScore', {
      sessionId: 'sess-end',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    await nextEvent(client, 'acked');

    client.emit('endSession', { sessionId: 'sess-end' });
    const ended = await nextEvent<{ sessionId: string }>(client, 'sessionEnded');
    expect(ended.sessionId).toBe('sess-end');

    const persisted = await storage.getById('sess-end');
    expect(persisted?.status).toBe('cancelled-by-user');

    client.disconnect();
  });

  it('enforces the per-user concurrent-session cap', async () => {
    limits = new UserLimits({ eventsPerSecond: 5, maxConcurrentSessions: 1 });
    io.of('/crowd').removeAllListeners();
    attachCrowdNamespace({ io, storage, userLimits: limits, jwtSecret: JWT_SECRET, logger: () => {} });

    const client = connect(mkToken('user-cap'));
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-cap-1',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    await nextEvent(client, 'acked');

    client.emit('submitCrowdScore', {
      sessionId: 'sess-cap-2',
      matchUpId: 'mu-2',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    const rejected = await nextEvent<{ reason: string }>(client, 'rejected');
    expect(rejected.reason).toBe('too-many-sessions');

    client.disconnect();
  });

  it('enforces the events/sec rate limit', async () => {
    limits = new UserLimits({ eventsPerSecond: 2, maxConcurrentSessions: 5 });
    io.of('/crowd').removeAllListeners();
    attachCrowdNamespace({ io, storage, userLimits: limits, jwtSecret: JWT_SECRET, logger: () => {} });

    const client = connect(mkToken('user-burst'));
    await new Promise<void>((resolve) => client.on('connect', resolve));

    const send = (sessionId: string) =>
      client.emit('submitCrowdScore', {
        sessionId,
        matchUpId: 'mu-1',
        tournamentId: 'tour-1',
        clientId: 'client-fp-1',
        point: mkPoint(1),
        currentScore: {},
      });

    send('sess-rl-1');
    await nextEvent(client, 'acked');
    send('sess-rl-2');
    await nextEvent(client, 'acked');
    send('sess-rl-3');
    const rejected = await nextEvent<{ reason: string; retryAfter?: number }>(client, 'rejected');
    expect(rejected.reason).toBe('rate-limited');
    expect(rejected.retryAfter).toBeTypeOf('number');

    client.disconnect();
  });

  // HiveID Phase 5 — verify hiveid-aud JWTs, stamp crowdScoredBy.

  it('rejects a hiveid-aud token without a personId claim', async () => {
    const token = signHs256({ sub: 'u-no-person', aud: 'hiveid' }, JWT_SECRET);
    const client = connect(token);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/missing-person-id/);
    client.disconnect();
  });

  it('rejects a token whose aud is none of admin/hiveid', async () => {
    const token = signHs256({ sub: 'u-projector', aud: 'projector' }, JWT_SECRET);
    const client = connect(token);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/audience-mismatch/);
    client.disconnect();
  });

  it('stamps crowdScoredBy from the JWT on a hiveid-aud session, ignoring client-supplied personId', async () => {
    const token = mkToken('u-hive-alice', {
      aud: 'hiveid',
      personId: 'person-canonical-alice',
      displayName: 'Alice from JWT',
    });
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-hive-1',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
      scorer: {
        // Client lies about personId — the namespace MUST ignore this and
        // use the JWT-attested one.
        personId: 'person-evil-impersonator',
        displayName: 'Alice from payload',
        audience: 'hiveid',
      },
    });
    await nextEvent(client, 'acked');

    const persisted = await storage.getById('sess-hive-1');
    expect(persisted?.crowdScoredBy?.audience).toBe('hiveid');
    expect(persisted?.crowdScoredBy?.personId).toBe('person-canonical-alice');
    // displayName from payload is allowed (server has no opinion on it)
    expect(persisted?.crowdScoredBy?.displayName).toBe('Alice from payload');

    client.disconnect();
  });

  it('records admin-aud attribution from the payload when supplied (TD on behalf of)', async () => {
    const token = mkToken('u-td-bob', { aud: 'admin' });
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-admin-1',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
      scorer: {
        personId: 'person-on-court',
        displayName: 'Person On Court',
        audience: 'admin',
      },
    });
    await nextEvent(client, 'acked');

    const persisted = await storage.getById('sess-admin-1');
    expect(persisted?.crowdScoredBy?.audience).toBe('admin');
    expect(persisted?.crowdScoredBy?.personId).toBe('person-on-court');
    expect(persisted?.crowdScoredBy?.displayName).toBe('Person On Court');

    client.disconnect();
  });

  it('omits crowdScoredBy on an admin-aud session with no scorer payload (anonymous-admin)', async () => {
    const token = mkToken('u-td-anon', { aud: 'admin' });
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('submitCrowdScore', {
      sessionId: 'sess-admin-2',
      matchUpId: 'mu-1',
      tournamentId: 'tour-1',
      clientId: 'client-fp-1',
      point: mkPoint(1),
      currentScore: {},
    });
    await nextEvent(client, 'acked');

    const persisted = await storage.getById('sess-admin-2');
    expect(persisted?.crowdScoredBy).toBeUndefined();

    client.disconnect();
  });
});
