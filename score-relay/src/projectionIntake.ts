/**
 * HTTP intake routes for projector payloads pushed by competition-factory-server.
 *
 * Two routes:
 *   POST /api/projection/scorebug      → ScorebugPayload
 *   POST /api/projection/video-board   → VideoBoardPayload
 *
 * Each handler:
 *   1. Optionally checks Bearer token (if PROJECTION_API_KEY env is set)
 *   2. Parses JSON body
 *   3. Fans out to a Socket.IO room on the /live namespace:
 *        - scorebug payloads → room `scorebug:{matchUpId}`
 *        - video-board payloads → room `videoboard:{matchUpId}`
 *   4. Returns `{ ok: true }` on success
 *
 * Subscribers join via:
 *   socket.on('subscribe:scorebug', matchUpId)
 *   socket.on('subscribe:videoboard', matchUpId)
 *
 * Video-board payloads are also forwarded to the optional UDP target
 * (see videoBoardForwarder.ts) for sub-frame-latency renderers.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Server } from 'socket.io';

import { forwardVideoBoardPayload } from './videoBoardForwarder.js';
import {
  isScorebugTick,
  type ScorebugInputPayload,
  type VideoBoardPayload,
} from './projectionTypes.js';

export interface ProjectionIntakeOptions {
  io: Server;
  apiKey?: string;
}

export function createProjectionIntake(options: ProjectionIntakeOptions) {
  const { io, apiKey } = options;
  const live = io.of('/live');

  function unauthorized(res: ServerResponse, message: string): void {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: message }));
  }

  function badRequest(res: ServerResponse, message: string): void {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: message }));
  }

  function ok(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  function checkAuth(req: IncomingMessage): boolean {
    if (!apiKey) return true;
    const header = req.headers['authorization'];
    if (typeof header !== 'string') return false;
    const provided = header.replace(/^Bearer\s+/i, '').trim();
    return provided === apiKey;
  }

  function readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  async function handleScorebug(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkAuth(req)) return unauthorized(res, 'invalid api key');
    try {
      const body = (await readBody(req)) as Partial<ScorebugInputPayload>;
      if (!body?.matchUpId) return badRequest(res, 'matchUpId required');

      // Two streams over the same intake route, discriminated by `kind`:
      //   - tick payloads (sub-second) → 'scorebug-tick'
      //   - event payloads (on bolt-history upsert) → 'scorebug-event'
      // Consumers subscribe to one or both depending on what they need.
      if (isScorebugTick(body as ScorebugInputPayload)) {
        live.to(`scorebug:${body.matchUpId}`).emit('scorebug-tick', body);
      } else {
        live.to(`scorebug:${body.matchUpId}`).emit('scorebug-event', body);
      }
      ok(res);
    } catch (err) {
      badRequest(res, (err as Error)?.message ?? 'parse error');
    }
  }

  async function handleVideoBoard(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkAuth(req)) return unauthorized(res, 'invalid api key');
    try {
      const body = (await readBody(req)) as Partial<VideoBoardPayload>;
      if (!body?.matchUpId) return badRequest(res, 'matchUpId required');
      live.to(`videoboard:${body.matchUpId}`).emit('videoboard', body);
      forwardVideoBoardPayload(body as VideoBoardPayload);
      ok(res);
    } catch (err) {
      badRequest(res, (err as Error)?.message ?? 'parse error');
    }
  }

  function attachLiveSubscriptions(): void {
    live.on('connection', (socket) => {
      socket.on('subscribe:scorebug', (matchUpId: string) => {
        if (typeof matchUpId === 'string' && matchUpId.length > 0) {
          socket.join(`scorebug:${matchUpId}`);
        }
      });
      socket.on('unsubscribe:scorebug', (matchUpId: string) => {
        socket.leave(`scorebug:${matchUpId}`);
      });
      socket.on('subscribe:videoboard', (matchUpId: string) => {
        if (typeof matchUpId === 'string' && matchUpId.length > 0) {
          socket.join(`videoboard:${matchUpId}`);
        }
      });
      socket.on('unsubscribe:videoboard', (matchUpId: string) => {
        socket.leave(`videoboard:${matchUpId}`);
      });
    });
  }

  attachLiveSubscriptions();

  return {
    handleScorebug,
    handleVideoBoard,
  };
}
