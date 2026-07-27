/**
 * CORS for the relay's hand-rolled HTTP REST endpoints.
 *
 * Socket.IO applies its own CORS via `new Server(httpServer, { cors })`, but that
 * only governs the Socket.IO handshake — it does NOT cover the plain `createServer`
 * request handler in server.ts. So the TMX-facing REST API (`/api/crowd-sessions`)
 * shipped without any `Access-Control-*` headers. That only surfaces in split-origin
 * dev (TMX :5173 → relay :8384); prod proxies the relay same-origin under nginx
 * `/relay/`, so no CORS is involved there.
 *
 * This helper closes the gap using the same `corsOrigin` allowlist the Socket.IO
 * server already honours (`RelayConfig.corsOrigin`: `'*'`, a single origin, or a
 * `string[]` allowlist).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Resolve the value for `Access-Control-Allow-Origin`, or `undefined` when the
 * request origin is not permitted (in which case no ACAO header is sent and the
 * browser blocks the cross-origin read, as intended).
 *
 * With a `'*'` policy the request origin is echoed back when present (so the
 * response works even if a caller later switches to credentialed requests);
 * otherwise `'*'`. With a single origin or an allowlist, the origin is echoed only
 * on an exact match.
 */
export function resolveAllowedOrigin(
  requestOrigin: string | undefined,
  corsOrigin: string | string[],
): string | undefined {
  if (corsOrigin === '*') return requestOrigin ?? '*';
  if (!requestOrigin) return undefined;
  const allowlist = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
  return allowlist.includes(requestOrigin) ? requestOrigin : undefined;
}

/**
 * Apply CORS response headers for a REST request. No-op (sends nothing) when the
 * origin is not permitted, so same-origin/allowed traffic is unaffected. Must be
 * called before the response is written.
 */
export function applyCorsHeaders(req: IncomingMessage, res: ServerResponse, corsOrigin: string | string[]): void {
  const allowed = resolveAllowedOrigin(req.headers.origin, corsOrigin);
  if (!allowed) return;
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}
