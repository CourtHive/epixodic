/**
 * Federation against an upstream relay that requires tracker auth. The local
 * relay forwards on its own federation identity (UPSTREAM_RELAY_TOKEN); without
 * one a strict upstream refuses the connection with missing-token, forever.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

import { disconnectUpstream } from './upstreamFederation.js';
import { signHs256 } from './crowd/jwtVerify.js';
import { createRelay } from './relay.js';

const JWT_SECRET = 'federation-secret';

let upstreamHttp: ReturnType<typeof createServer>;
let upstreamIo: Server;
let localHttp: ReturnType<typeof createServer>;
let localIo: Server;
let upstreamPort: number;
let localPort: number;
const sockets: ClientSocket[] = [];

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
    });
  });
}

function connect(port: number, namespace: string): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://localhost:${port}${namespace}`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
  });
}

beforeAll(async () => {
  upstreamHttp = createServer();
  upstreamIo = new Server(upstreamHttp);
  createRelay(upstreamIo, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 1,
    pruneIntervalMinutes: 60,
    trackerJwtSecret: JWT_SECRET,
    trackerRequireAuth: true,
  });
  upstreamPort = await listen(upstreamHttp);

  localHttp = createServer();
  localIo = new Server(localHttp);
  createRelay(localIo, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 1,
    pruneIntervalMinutes: 60,
    upstreamRelayUrl: `http://localhost:${upstreamPort}`,
    upstreamRelayToken: signHs256({ userId: 'federation:site-1', aud: 'admin' }, JWT_SECRET),
  });
  localPort = await listen(localHttp);
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  disconnectUpstream();
  localIo.close();
  upstreamIo.close();
  await new Promise<void>((resolve) => localHttp.close(() => resolve()));
  await new Promise<void>((resolve) => upstreamHttp.close(() => resolve()));
});

describe('federation to a strict upstream', () => {
  it('forwards tracker scores on the federation identity', async () => {
    const listener = await connect(upstreamPort, '/live');
    listener.emit('subscribe', 'fed-auth-1');
    const tracker = await connect(localPort, '/tracker');

    // The upstream link connects asynchronously; resend until it carries one.
    const received = new Promise<any>((resolve) => listener.once('score', resolve));
    const timer = setInterval(() => tracker.emit('score', { matchUpId: 'fed-auth-1', score: { n: 1 } }), 100);
    try {
      expect((await received).matchUpId).toBe('fed-auth-1');
    } finally {
      clearInterval(timer);
    }
  });
});
