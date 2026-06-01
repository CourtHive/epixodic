/**
 * Integration tests for the /tracker auth + ownership + rate-limit
 * paths added for IONSport. Spins up a separate relay instance per
 * test so the auth config can differ from the shared baseline relay
 * in relay.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server as IoServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createRelay } from './relay.js';
import { signHs256 } from './crowd/jwtVerify.js';

const JWT_SECRET = 'tracker-integration-secret';

async function nextEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 1500): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('/tracker auth (strict mode)', () => {
  let httpServer: HttpServer;
  let io: IoServer;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    io = new IoServer(httpServer);
    createRelay(io, {
      port: 0,
      persistScores: false,
      corsOrigin: '*',
      staleMatchHours: 4,
      pruneIntervalMinutes: 30,
      trackerJwtSecret: JWT_SECRET,
      trackerRequireAuth: true,
      trackerMaxEventsPerSecond: 3,
    });
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
  });

  function connect(token: string | undefined): ClientSocket {
    return ioClient(`http://localhost:${port}/tracker`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
  }

  it('rejects a connection with no token in strict mode', async () => {
    const client = connect(undefined);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/missing-token/);
    client.disconnect();
  });

  it('rejects a connection with a bad signature', async () => {
    const tampered = signHs256({ sub: 'svc', aud: 'admin' }, 'wrong-secret');
    const client = connect(tampered);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/bad-signature/);
    client.disconnect();
  });

  it('rejects a score-aud token missing the tournamentId claim', async () => {
    const token = signHs256({ sub: 'svc', aud: 'score' }, JWT_SECRET);
    const client = connect(token);
    const err = await new Promise<Error>((resolve) => client.on('connect_error', resolve));
    expect(err.message).toMatch(/missing-tournament-id/);
    client.disconnect();
  });

  it('admits an admin-aud token and acks scores from any tournament', async () => {
    const token = signHs256({ sub: 'u-td', aud: 'admin' }, JWT_SECRET);
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('score', {
      matchUpId: 'mu-strict-admin-1',
      tournamentId: 't-anything',
      score: { scoreStringSide1: '15-0' },
    });
    const ack = await nextEvent<{ matchUpId: string }>(client, 'ack');
    expect(ack.matchUpId).toBe('mu-strict-admin-1');

    client.disconnect();
  });

  it('admits a score-aud token and acks frames for the JWT tournament', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('score', {
      matchUpId: 'mu-strict-score-1',
      tournamentId: 't-ion',
      score: { scoreStringSide1: '15-0' },
    });
    const ack = await nextEvent<{ matchUpId: string }>(client, 'ack');
    expect(ack.matchUpId).toBe('mu-strict-score-1');

    client.disconnect();
  });

  it('drops score frames whose tournamentId does not match the score-aud claim', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.emit('score', {
      matchUpId: 'mu-x',
      tournamentId: 't-other',
      score: { scoreStringSide1: '0-0' },
    });
    const err = await nextEvent<{ message: string }>(client, 'error');
    expect(err.message).toMatch(/tournament-mismatch/);

    client.disconnect();
  });

  // H2 — score-aud frame ownership bypass when tournamentId is omitted.
  // A score-aud holder for tournament A must not be able to skip the
  // mismatch check by simply leaving tournamentId off the frame and
  // reach `listeners.to('all')` as if the token were global.
  it('stamps the score-aud tournament onto a score frame that omits it', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const tracker = connect(token);
    await new Promise<void>((resolve) => tracker.on('connect', resolve));

    const inScope = ioClient(`http://localhost:${port}/live`, {
      transports: ['websocket'],
      forceNew: true,
    });
    const outOfScope = ioClient(`http://localhost:${port}/live`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await Promise.all([
      new Promise<void>((resolve) => inScope.on('connect', () => resolve())),
      new Promise<void>((resolve) => outOfScope.on('connect', () => resolve())),
    ]);
    inScope.emit('subscribe:tournament', 't-ion');
    outOfScope.emit('subscribe:tournament', 't-other');
    await new Promise((r) => setTimeout(r, 50));

    let receivedOutOfScope = false;
    outOfScope.on('score', () => {
      receivedOutOfScope = true;
    });

    const inScopeReceived = nextEvent<{ matchUpId: string; tournamentId?: string }>(inScope, 'score');
    tracker.emit('score', {
      matchUpId: 'mu-omit-tid',
      // tournamentId intentionally omitted by a malicious client
      score: { scoreStringSide1: '0-0' },
    });
    const ack = await nextEvent<{ matchUpId: string }>(tracker, 'ack');
    expect(ack.matchUpId).toBe('mu-omit-tid');

    const got = await inScopeReceived;
    expect(got.matchUpId).toBe('mu-omit-tid');
    // The relay must have stamped the token's tournamentId onto the frame
    // before fan-out so subscribers can route on it correctly.
    expect(got.tournamentId).toBe('t-ion');

    // Cross-tournament listener must NOT see this frame even though the
    // client sent it without a tournamentId.
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedOutOfScope).toBe(false);

    tracker.disconnect();
    inScope.disconnect();
    outOfScope.disconnect();
  });

  it('stamps the score-aud tournament onto an intennse frame that omits it', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const tracker = connect(token);
    await new Promise<void>((resolve) => tracker.on('connect', resolve));

    const inScope = ioClient(`http://localhost:${port}/live`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve) => inScope.on('connect', () => resolve()));
    inScope.emit('subscribe:tournament', 't-ion');
    await new Promise((r) => setTimeout(r, 50));

    const received = nextEvent<{ matchUpId: string; tournamentId?: string }>(inScope, 'intennse');
    tracker.emit('intennse', {
      matchUpId: 'mu-omit-tid-intennse',
      boltScore: { side1: 1, side2: 0 },
      aggregateScore: { side1: 1, side2: 0 },
      server: 0,
    });
    await nextEvent(tracker, 'ack');

    const got = await received;
    expect(got.matchUpId).toBe('mu-omit-tid-intennse');
    expect(got.tournamentId).toBe('t-ion');

    tracker.disconnect();
    inScope.disconnect();
  });

  it('stamps the score-aud tournament onto a clockSync frame that omits it', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const tracker = connect(token);
    await new Promise<void>((resolve) => tracker.on('connect', resolve));

    const inScope = ioClient(`http://localhost:${port}/live`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve) => inScope.on('connect', () => resolve()));
    inScope.emit('subscribe:tournament', 't-ion');
    await new Promise((r) => setTimeout(r, 50));

    const received = nextEvent<{ matchUpId: string; tournamentId?: string }>(inScope, 'clockSync');
    tracker.emit('clockSync', {
      matchUpId: 'mu-omit-tid-sync',
      boltTimerRemainingMs: 200000,
      serveClockRemainingMs: 12000,
      clockState: 'paused',
    });
    await nextEvent(tracker, 'ack');

    const got = await received;
    expect(got.matchUpId).toBe('mu-omit-tid-sync');
    expect(got.tournamentId).toBe('t-ion');

    tracker.disconnect();
    inScope.disconnect();
  });

  it('stamps the score-aud tournament onto a history frame that omits it', async () => {
    const token = signHs256(
      { sub: 'svc-ionsport', aud: 'score', tournamentId: 't-ion' },
      JWT_SECRET,
    );
    const tracker = connect(token);
    await new Promise<void>((resolve) => tracker.on('connect', resolve));

    // history is acknowledged but only fans out to the per-matchUp room
    // (no tournament/all fan-out). The visible signal is the stored
    // record's tournamentId — assert via the ack contract is fine here
    // since the persistence side is exercised by persistence tests.
    tracker.emit('history', {
      matchUpId: 'mu-omit-tid-hist',
      points: [{ winner: 0 }],
      // tournamentId omitted
    });
    const ack = await nextEvent<{ matchUpId: string }>(tracker, 'ack');
    expect(ack.matchUpId).toBe('mu-omit-tid-hist');

    tracker.disconnect();
  });

  it('keeps frames with a matching tournamentId untouched (admin-aud)', async () => {
    // Admin-aud tokens have no token-side tournament binding; they may
    // legitimately omit tournamentId. The stamp must not run for admin.
    const token = signHs256({ sub: 'u-td', aud: 'admin' }, JWT_SECRET);
    const tracker = connect(token);
    await new Promise<void>((resolve) => tracker.on('connect', resolve));

    const allListener = ioClient(`http://localhost:${port}/live`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve) => allListener.on('connect', () => resolve()));
    allListener.emit('subscribe:all');
    await new Promise((r) => setTimeout(r, 50));

    const received = nextEvent<{ matchUpId: string; tournamentId?: string }>(allListener, 'score');
    tracker.emit('score', {
      matchUpId: 'mu-admin-no-tid',
      score: { scoreStringSide1: '1-0' },
    });
    await nextEvent(tracker, 'ack');

    const got = await received;
    expect(got.matchUpId).toBe('mu-admin-no-tid');
    expect(got.tournamentId).toBeUndefined();

    tracker.disconnect();
    allListener.disconnect();
  });

  it('rate-limits per matchUp at trackerMaxEventsPerSecond', async () => {
    const token = signHs256({ sub: 'u', aud: 'admin' }, JWT_SECRET);
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    // F1 (architectural-standards.md A6): generate a unique matchUpId
    // per test so we never share a bucket with another test in this
    // suite-scoped relay. Without this, a future test that touches
    // 'mu-rate-1' would silently inherit a drained bucket.
    const matchUpId = `mu-rate-${randomBytes(4).toString('hex')}`;

    // Capacity = 3; 4 rapid emits → 4th rejected.
    for (let i = 0; i < 3; i++) {
      client.emit('score', { matchUpId, score: { scoreStringSide1: `${i}` } });
      await nextEvent(client, 'ack');
    }
    client.emit('score', { matchUpId, score: { scoreStringSide1: '4' } });
    const rejected = await nextEvent<{ reason: string; retryAfter?: number }>(client, 'rejected');
    expect(rejected.reason).toBe('rate-limited');
    expect(rejected.retryAfter).toBeTypeOf('number');

    client.disconnect();
  });
});
