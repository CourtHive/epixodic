/**
 * The /tracker connect cap behind a proxy, end to end: a real relay with a cap of one connect per minute, and
 * clients that reach it over loopback (as nginx does in production) carrying the proxy's client-address header.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import type { RelayConfig } from './types.js';
import { createRelay } from './relay.js';
import { createServer } from 'http';
import { Server } from 'socket.io';

const HEADER = 'cf-connecting-ip';
const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function startRelay(extra: Partial<RelayConfig>): Promise<number> {
  const httpServer = createServer();
  const io = new Server(httpServer);
  createRelay(io, {
    port: 0,
    staleMatchHours: 6,
    pruneIntervalMinutes: 30,
    trackerMaxConnectsPerMinute: 1,
    ...extra,
  });
  closers.push(() => {
    io.close();
    httpServer.close();
  });
  return new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

/** Resolves 'connected' or the refusal message. */
function handshake(port: number, clientIp: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}/tracker`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { [HEADER]: clientIp },
    });
    closers.push(() => socket.disconnect());
    socket.on('connect', () => resolve('connected'));
    socket.on('connect_error', (err) => resolve(err.message));
  });
}

describe('/tracker connect cap behind a proxy', () => {
  it('keys the cap per client address when the proxy header is trusted', async () => {
    const port = await startRelay({ clientIpHeader: HEADER });
    expect(await handshake(port, '203.0.113.1')).toBe('connected');
    expect(await handshake(port, '203.0.113.2')).toBe('connected');
    expect(await handshake(port, '203.0.113.1')).toBe('connect-rate-limited');
  });

  // Production before the fix: every handshake came from the proxy's loopback address, one cap for everyone.
  it('without the setting, every client behind the proxy shares one cap', async () => {
    const port = await startRelay({});
    expect(await handshake(port, '203.0.113.1')).toBe('connected');
    expect(await handshake(port, '203.0.113.2')).toBe('connect-rate-limited');
  });
});
