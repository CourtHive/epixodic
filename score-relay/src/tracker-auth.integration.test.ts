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

  it('rate-limits per matchUp at trackerMaxEventsPerSecond', async () => {
    const token = signHs256({ sub: 'u', aud: 'admin' }, JWT_SECRET);
    const client = connect(token);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    // Capacity = 3; 4 rapid emits → 4th rejected.
    for (let i = 0; i < 3; i++) {
      client.emit('score', { matchUpId: 'mu-rate-1', score: { scoreStringSide1: `${i}` } });
      await nextEvent(client, 'ack');
    }
    client.emit('score', { matchUpId: 'mu-rate-1', score: { scoreStringSide1: '4' } });
    const rejected = await nextEvent<{ reason: string; retryAfter?: number }>(client, 'rejected');
    expect(rejected.reason).toBe('rate-limited');
    expect(rejected.retryAfter).toBeTypeOf('number');

    client.disconnect();
  });
});
