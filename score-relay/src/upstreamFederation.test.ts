/**
 * Integration tests for upstream relay federation.
 *
 * Spins up two relay instances: a "local" relay (with UPSTREAM_RELAY_URL
 * pointing at the "upstream" relay) and verifies that tracker events
 * on the local relay are forwarded to the upstream relay's /live listeners.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { createRelay } from './relay.js';
import { getActiveMatchIds, removeMatch } from './matchUpStore.js';
import { disconnectUpstream } from './upstreamFederation.js';

let upstreamHttp: ReturnType<typeof createServer>;
let upstreamIo: Server;
let upstreamPort: number;

let localHttp: ReturnType<typeof createServer>;
let localIo: Server;
let localPort: number;

function connectClient(port: number, namespace: string): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://localhost:${port}${namespace}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
  });
}

function waitForEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function clearStore() {
  for (const id of getActiveMatchIds()) {
    removeMatch(id);
  }
}

beforeAll(async () => {
  // Start the upstream relay (no federation — it's the cloud instance)
  upstreamHttp = createServer();
  upstreamIo = new Server(upstreamHttp, { cors: { origin: '*' } });
  createRelay(upstreamIo, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 1,
    pruneIntervalMinutes: 60,
  });
  await new Promise<void>((resolve) => upstreamHttp.listen(0, resolve));
  upstreamPort = (upstreamHttp.address() as any).port;

  // Start the local relay with federation pointing at upstream
  localHttp = createServer();
  localIo = new Server(localHttp, { cors: { origin: '*' } });
  createRelay(localIo, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 1,
    pruneIntervalMinutes: 60,
    upstreamRelayUrl: `http://localhost:${upstreamPort}`,
  });
  await new Promise<void>((resolve) => localHttp.listen(0, resolve));
  localPort = (localHttp.address() as any).port;

  // Give the federation client a moment to connect
  await new Promise((r) => setTimeout(r, 500));
});

afterAll(async () => {
  disconnectUpstream();
  clearStore();
  localIo.close();
  upstreamIo.close();
  localHttp.close();
  upstreamHttp.close();
});

describe('Upstream relay federation', () => {
  it('forwards score events from local tracker to upstream live listeners', async () => {
    const localTracker = await connectClient(localPort, '/tracker');
    const upstreamListener = await connectClient(upstreamPort, '/live');

    // Subscribe to match on upstream
    upstreamListener.emit('subscribe', 'fed-m1');
    await new Promise((r) => setTimeout(r, 100));

    // Emit score on local tracker
    const scoreData = {
      matchUpId: 'fed-m1',
      tournamentId: 't1',
      score: { scoreStringSide1: '6-4 3-2', scoreStringSide2: '4-6 2-3' },
    };
    const scorePromise = waitForEvent(upstreamListener, 'score');
    localTracker.emit('score', scoreData);

    const received = await scorePromise;
    expect(received.matchUpId).toBe('fed-m1');
    expect(received.score.scoreStringSide1).toBe('6-4 3-2');

    localTracker.disconnect();
    upstreamListener.disconnect();
  });

  it('forwards intennse events to upstream', async () => {
    const localTracker = await connectClient(localPort, '/tracker');
    const upstreamListener = await connectClient(upstreamPort, '/live');

    upstreamListener.emit('subscribe', 'fed-m2');
    await new Promise((r) => setTimeout(r, 100));

    const intennseData = {
      matchUpId: 'fed-m2',
      tournamentId: 't1',
      boltTimerRemainingMs: 120000,
      serveClockRemainingMs: 8000,
    };
    const eventPromise = waitForEvent(upstreamListener, 'intennse');
    localTracker.emit('intennse', intennseData);

    const received = await eventPromise;
    expect(received.matchUpId).toBe('fed-m2');
    expect(received.boltTimerRemainingMs).toBe(120000);

    localTracker.disconnect();
    upstreamListener.disconnect();
  });

  it('forwards clockSync events to upstream', async () => {
    const localTracker = await connectClient(localPort, '/tracker');
    const upstreamListener = await connectClient(upstreamPort, '/live');

    upstreamListener.emit('subscribe', 'fed-m3');
    await new Promise((r) => setTimeout(r, 100));

    const clockData = {
      matchUpId: 'fed-m3',
      clockState: 'paused',
      boltTimerRemainingMs: 60000,
      serveClockRemainingMs: 5000,
    };
    const eventPromise = waitForEvent(upstreamListener, 'clockSync');
    localTracker.emit('clockSync', clockData);

    const received = await eventPromise;
    expect(received.matchUpId).toBe('fed-m3');
    expect(received.clockState).toBe('paused');

    localTracker.disconnect();
    upstreamListener.disconnect();
  });

  it('forwards history events to upstream', async () => {
    const localTracker = await connectClient(localPort, '/tracker');
    const upstreamListener = await connectClient(upstreamPort, '/live');

    upstreamListener.emit('subscribe', 'fed-m4');
    await new Promise((r) => setTimeout(r, 100));

    const historyData = {
      matchUpId: 'fed-m4',
      points: [{ winner: 1 }, { winner: 2 }],
    };
    const eventPromise = waitForEvent(upstreamListener, 'history');
    localTracker.emit('history', historyData);

    const received = await eventPromise;
    expect(received.matchUpId).toBe('fed-m4');
    expect(received.points).toHaveLength(2);

    localTracker.disconnect();
    upstreamListener.disconnect();
  });

  it('does not block local fan-out when upstream is configured', async () => {
    const localTracker = await connectClient(localPort, '/tracker');
    const localListener = await connectClient(localPort, '/live');

    localListener.emit('subscribe', 'fed-m5');
    await new Promise((r) => setTimeout(r, 100));

    const scoreData = {
      matchUpId: 'fed-m5',
      score: { scoreStringSide1: '1-0' },
    };
    const localPromise = waitForEvent(localListener, 'score');
    localTracker.emit('score', scoreData);

    const received = await localPromise;
    expect(received.matchUpId).toBe('fed-m5');

    localTracker.disconnect();
    localListener.disconnect();
  });
});
