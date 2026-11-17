/**
 * The client address a per-IP limit should key on.
 *
 * Behind a reverse proxy every handshake's socket address is the proxy's, so
 * a per-IP cap keyed on it is one cap shared by every client: in production
 * (nginx → relay on loopback) one tab retrying a refused handshake every 5s
 * spent a fifth of every tracker's 60/min (2026-11-17).
 *
 * A deployment names the header its proxy sets to the real client address
 * (`CLIENT_IP_HEADER`, e.g. `cf-connecting-ip` on nest, whose origin accepts
 * Cloudflare only). The header is believed only when:
 *   - a header is configured (off by default: a client can set any header),
 *   - the socket's own peer is loopback, i.e. the request came through the
 *     local proxy rather than straight to the relay's port, and
 *   - its value is a single IP address.
 * Anything else falls back to the socket address, as before.
 */

import { isIP } from 'node:net';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface HandshakeLike {
  address?: string;
  headers: Record<string, string | string[] | undefined>;
}

export function clientAddress(handshake: HandshakeLike, trustedHeader?: string): string {
  const peer = handshake.address || 'unknown';
  if (!trustedHeader || !LOOPBACK.has(peer)) return peer;
  const raw = handshake.headers[trustedHeader.toLowerCase()];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value && isIP(value) ? value : peer;
}

/** Normalise the `CLIENT_IP_HEADER` setting: a header name, or undefined when unset or blank. */
export function resolveClientIpHeader(value: string | undefined): string | undefined {
  const name = value?.trim().toLowerCase();
  return name || undefined;
}
