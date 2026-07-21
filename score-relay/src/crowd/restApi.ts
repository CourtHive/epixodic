/**
 * REST API for TMX — Phase 3 slice 3.
 *
 * Endpoints (all JWT-protected with HS256 shared secret):
 *
 *   GET    /api/crowd-sessions?matchUpId=...
 *   GET    /api/crowd-sessions?tournamentId=...&trustedOnly=true&activeOnly=true
 *   POST   /api/crowd-sessions/:sessionId/promote
 *   POST   /api/crowd-sessions/:sessionId/demote
 *   DELETE /api/crowd-sessions/:sessionId
 *
 * The handlers are vanilla `(req, res) => Promise<void>` so they slot
 * into score-relay's hand-rolled HTTP router in server.ts. Each handler
 * returns JSON with a 2xx success / 4xx client-error / 5xx server-error.
 *
 * Authentication: any valid JWT issued by competition-factory-server.
 * Role gating (TD-only) is intentionally out of scope here — the
 * planning doc treats any logged-in user as eligible to promote in
 * Phase 3; tighter rules land in Phase 4.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { JwtVerificationError, verifyJwt, type JwtPayload } from './jwtVerify.js';
import { SessionNotFoundError } from './types.js';
import type { CrowdScoringStorage } from './storage.js';
import type { KeyObject } from 'node:crypto';

export interface CrowdRestApiOptions {
  storage: CrowdScoringStorage;
  jwtSecret: string;
  /** ES256 public keys by `kid` (dual-accept during the signing migration). */
  es256Keys?: Map<string, KeyObject>;
  logger?: (message: string) => void;
}

export interface CrowdRestApi {
  /**
   * Route a request. Returns true if it matched a /api/crowd-sessions path
   * (handler has already written the response). Returns false if the
   * path is not ours — caller should continue routing.
   */
  route: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

export function createCrowdRestApi(opts: CrowdRestApiOptions): CrowdRestApi {
  const log = opts.logger ?? ((m: string) => console.log(`[crowd-rest] ${m}`));
  if (!opts.jwtSecret) throw new Error('createCrowdRestApi: jwtSecret is required');

  return {
    route: async (req, res) => {
      const url = req.url ?? '';
      if (!url.startsWith('/api/crowd-sessions')) return false;

      const auth = authenticate(req, opts.jwtSecret, opts.es256Keys);
      if (!auth.ok) {
        respondJson(res, 401, { error: auth.reason });
        return true;
      }

      try {
        await handle(req, res, url, auth.payload, opts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`unhandled error on ${req.method} ${url}: ${message}`);
        respondJson(res, 500, { error: 'internal-error' });
      }
      return true;
    },
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  _payload: JwtPayload,
  opts: CrowdRestApiOptions,
): Promise<void> {
  const parsed = parseUrl(url);
  const method = req.method ?? 'GET';

  // GET /api/crowd-sessions?matchUpId=... | ?tournamentId=...
  if (parsed.pathname === '/api/crowd-sessions' && method === 'GET') {
    const matchUpId = parsed.searchParams.get('matchUpId');
    const tournamentId = parsed.searchParams.get('tournamentId');
    const activeOnly = parsed.searchParams.get('activeOnly') === 'true';
    const trustedOnly = parsed.searchParams.get('trustedOnly') === 'true';

    if (matchUpId) {
      const sessions = await opts.storage.getByMatchUpId(matchUpId, { activeOnly });
      respondJson(res, 200, { sessions });
      return;
    }
    if (tournamentId) {
      const sessions = await opts.storage.getByTournamentId(tournamentId, { activeOnly, trustedOnly });
      respondJson(res, 200, { sessions });
      return;
    }
    respondJson(res, 400, { error: 'matchUpId-or-tournamentId-required' });
    return;
  }

  // POST /api/crowd-sessions/:sessionId/promote
  // POST /api/crowd-sessions/:sessionId/demote
  // DELETE /api/crowd-sessions/:sessionId
  const sessionMatch = /^\/api\/crowd-sessions\/([^/]+)(?:\/(promote|demote))?$/.exec(parsed.pathname);
  if (sessionMatch) {
    const [, sessionId, action] = sessionMatch;

    if (method === 'POST' && action === 'promote') {
      const trustedBy = typeof _payload.sub === 'string' ? _payload.sub : 'unknown';
      // Provider-scoped tokens (a `tournamentId` claim) may only nominate within
      // their tournament scope — enforced from the token, so the relay needs no
      // tournament→provider mapping.
      const scopeTournamentId = typeof _payload.tournamentId === 'string' ? _payload.tournamentId : undefined;
      if (scopeTournamentId) {
        const existing = await opts.storage.getById(sessionId);
        if (existing && existing.tournamentId !== scopeTournamentId) {
          respondJson(res, 403, { error: 'tournament-scope-mismatch' });
          return;
        }
      }
      try {
        const session = await opts.storage.promote(sessionId, trustedBy);
        respondJson(res, 200, { session });
      } catch (err) {
        if (err instanceof SessionNotFoundError) respondJson(res, 404, { error: 'session-not-found' });
        else throw err;
      }
      return;
    }
    if (method === 'POST' && action === 'demote') {
      try {
        const session = await opts.storage.demote(sessionId);
        respondJson(res, 200, { session });
      } catch (err) {
        if (err instanceof SessionNotFoundError) respondJson(res, 404, { error: 'session-not-found' });
        else throw err;
      }
      return;
    }
    if (method === 'DELETE' && !action) {
      const cancelled = await opts.storage.cancelSession(sessionId);
      if (!cancelled) {
        respondJson(res, 404, { error: 'session-not-found-or-not-active' });
        return;
      }
      respondJson(res, 200, { session: cancelled });
      return;
    }
    respondJson(res, 405, { error: 'method-not-allowed' });
    return;
  }

  respondJson(res, 404, { error: 'not-found' });
}

interface AuthOk {
  ok: true;
  payload: JwtPayload;
}
interface AuthError {
  ok: false;
  reason: string;
}

function authenticate(
  req: IncomingMessage,
  secret: string,
  es256Keys?: Map<string, KeyObject>,
): AuthOk | AuthError {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing-bearer-token' };
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    return { ok: true, payload: verifyJwt(token, { hsSecret: secret, es256Keys }) };
  } catch (err) {
    const reason = err instanceof JwtVerificationError ? err.reason : 'bad-token';
    return { ok: false, reason };
  }
}

function parseUrl(rawUrl: string): URL {
  // base only used for parsing; the real protocol/host is irrelevant
  return new URL(rawUrl, 'http://relay.local');
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
