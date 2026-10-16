/**
 * /tracker hardening — malformed frames, control-frame rate limits, and which
 * principals may drive the relay's persistence (its own service identity).
 *
 * Socket.IO 4 dispatches a handler inside `process.nextTick`, so a throw there is
 * an uncaught exception that ends the process. Every malformed frame below used
 * to be one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as IoServer } from 'socket.io';

vi.mock('./persistence.js', () => ({ persistMatchHistory: vi.fn(() => new Promise<void>(() => {})) }));
vi.mock('./pointHistoryPersistence.js', () => ({ persistPoint: vi.fn(async () => {}) }));

import { persistMatchHistory } from './persistence.js';
import { persistPoint } from './pointHistoryPersistence.js';
import { signHs256 } from './crowd/jwtVerify.js';
import { createRelay } from './relay.js';

const JWT_SECRET = 'tracker-hardening-secret';

let httpServer: HttpServer;
let io: IoServer;
let port: number;
const open: ClientSocket[] = [];

function connect(namespace: string, token?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}${namespace}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
    });
    open.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function nextEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  httpServer = createServer();
  io = new IoServer(httpServer);
  // Permissive mode WITH a secret: no token → anonymous, a valid token → verified.
  createRelay(io, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 4,
    pruneIntervalMinutes: 30,
    trackerJwtSecret: JWT_SECRET,
    trackerMaxEventsPerSecond: 5,
  });
  port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
    });
  });
});

afterAll(async () => {
  for (const socket of open) socket.disconnect();
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  vi.mocked(persistMatchHistory).mockClear();
  vi.mocked(persistPoint).mockClear();
});

describe('malformed tracker frames', () => {
  it('rejects an intennse frame whose matchUpStatus is not a string, and keeps serving', async () => {
    const tracker = await connect('/tracker');
    const error = nextEvent(tracker, 'error');
    tracker.emit('intennse', { matchUpId: 'h-1', matchUpStatus: 5, boltTimerRemainingMs: 1000 });
    expect((await error).message).toBe('invalid-frame');

    const ack = nextEvent(tracker, 'ack');
    tracker.emit('score', { matchUpId: 'h-1', score: {} });
    expect((await ack).matchUpId).toBe('h-1');
  });

  it('rejects a score frame whose matchUpStatus is not a string when it carries a bolt clock', async () => {
    const tracker = await connect('/tracker');
    const error = nextEvent(tracker, 'error');
    tracker.emit('score', { matchUpId: 'h-2', score: {}, matchUpStatus: { x: 1 }, boltTimerRemainingMs: 1000 });
    expect((await error).message).toBe('invalid-frame');
  });

  it('rejects a frame whose matchUpId is not a string', async () => {
    const tracker = await connect('/tracker');
    const error = nextEvent(tracker, 'error');
    tracker.emit('score', { matchUpId: { $ne: 1 }, score: {} });
    expect((await error).message).toMatch(/matchUpId required/);
  });

  it('rejects a frame that is not an object', async () => {
    const tracker = await connect('/tracker');
    const error = nextEvent(tracker, 'error');
    tracker.emit('clockSync', 'h-3');
    expect((await error).message).toMatch(/matchUpId required/);
  });

  it('survives a listener subscribing with a non-string id', async () => {
    const listener = await connect('/live');
    listener.emit('subscribe', { matchUpId: 'h-4' });
    listener.emit('subscribe:tournament', 42);
    const tracker = await connect('/tracker');
    const ack = nextEvent(tracker, 'ack');
    tracker.emit('score', { matchUpId: 'h-4', score: {} });
    expect((await ack).matchUpId).toBe('h-4');
  });
});

describe('control frames are rate limited on their own bucket', () => {
  it('a clockSync flood is rejected rather than processed without bound', async () => {
    const tracker = await connect('/tracker');
    const rejected = nextEvent(tracker, 'rejected');
    for (let i = 0; i < 50; i++) {
      tracker.emit('clockSync', { matchUpId: 'h-flood', boltTimerRemainingMs: 1000, clockState: 'paused' });
    }
    expect((await rejected).reason).toBe('rate-limited');
  });

  it('a clockSync flood does not consume the score bucket', async () => {
    const tracker = await connect('/tracker');
    for (let i = 0; i < 50; i++) {
      tracker.emit('clockSync', { matchUpId: 'h-split', boltTimerRemainingMs: 1000, clockState: 'paused' });
    }
    await new Promise((r) => setTimeout(r, 100));
    const ack = nextEvent(tracker, 'ack');
    tracker.emit('score', { matchUpId: 'h-split-score', score: {} });
    expect((await ack).matchUpId).toBe('h-split-score');
  });
});

describe('history and the relay service identity', () => {
  it('an anonymous history frame is fanned out but never persisted canonically', async () => {
    const tracker = await connect('/tracker');
    const listener = await connect('/live');
    listener.emit('subscribe', 'h-anon');
    await new Promise((r) => setTimeout(r, 50));

    const history = nextEvent(listener, 'history');
    tracker.emit('history', { matchUpId: 'h-anon', tournamentId: 't-1', points: [] });
    expect((await history).matchUpId).toBe('h-anon');
    expect(persistMatchHistory).not.toHaveBeenCalled();
  });

  it('an authenticated history frame notifies listeners before persistence settles', async () => {
    const token = signHs256({ userId: 'td-1', aud: 'admin' }, JWT_SECRET);
    const tracker = await connect('/tracker', token);
    const listener = await connect('/live');
    listener.emit('subscribe', 'h-auth');
    await new Promise((r) => setTimeout(r, 50));

    // persistMatchHistory never resolves (see the mock), so the listener only
    // hears the history if notification does not wait for it.
    const history = nextEvent(listener, 'history');
    tracker.emit('history', { matchUpId: 'h-auth', tournamentId: 't-1', points: [] });
    expect((await history).matchUpId).toBe('h-auth');
    expect(persistMatchHistory).toHaveBeenCalledTimes(1);
  });

  it('repeated history frames for one match do not launch unbounded persistence', async () => {
    const token = signHs256({ userId: 'td-2', aud: 'admin' }, JWT_SECRET);
    const tracker = await connect('/tracker', token);
    for (let i = 0; i < 4; i++) tracker.emit('history', { matchUpId: 'h-repeat', tournamentId: 't-1', points: [] });
    await new Promise((r) => setTimeout(r, 150));
    // The first is in flight (and never settles); the rest coalesce behind it.
    expect(persistMatchHistory).toHaveBeenCalledTimes(1);
  });
});
