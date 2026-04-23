import { io as ioClient, Socket } from 'socket.io-client';

const MAX_BACKOFF_MS = 30_000;
const INITIAL_RETRY_MS = 1_000;

let upstream: Socket | null = null;

/**
 * Connect to the upstream relay's /tracker namespace and return a
 * forwarder function. The forwarder is fire-and-forget — it never
 * throws or blocks the caller.
 *
 * The connection auto-reconnects with exponential backoff.
 * Returns null if no URL is configured.
 */
export function connectUpstream(url: string): (event: string, data: any) => void {
  upstream = ioClient(`${url.replace(/\/$/, '')}/tracker`, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: INITIAL_RETRY_MS,
    reconnectionDelayMax: MAX_BACKOFF_MS,
    reconnectionAttempts: Infinity,
    // Don't buffer events while disconnected — we don't want a flood
    // of stale events when the connection comes back. The mutation
    // mirror (Postgres-backed) handles durable delivery.
    // Socket.IO client buffers by default; volatile emits skip the buffer.
  });

  upstream.on('connect', () => {
    console.log(`[federation] connected to upstream ${url}/tracker`);
  });

  upstream.on('disconnect', (reason: string) => {
    console.log(`[federation] disconnected from upstream: ${reason}`);
  });

  upstream.on('connect_error', (err: Error) => {
    console.warn(`[federation] upstream connection error: ${err.message}`);
  });

  // Return a forwarder that callers use to push events upstream.
  // Uses volatile emit — if not connected, the event is silently dropped.
  // This is intentional: relay events are ephemeral real-time data,
  // and the mutation mirror handles durable delivery of scoring state.
  const socket = upstream;
  return (event: string, data: any) => {
    if (socket.connected) {
      socket.volatile.emit(event, data);
    }
  };
}

/** Disconnect from upstream. Used in tests and shutdown. */
export function disconnectUpstream(): void {
  if (upstream) {
    upstream.disconnect();
    upstream = null;
  }
}
