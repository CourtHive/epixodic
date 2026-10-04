/**
 * Internal webhook receiver — Phase 3 slice 4.
 *
 * Receives `POST /api/internal/matchup-finalized` calls from
 * competition-factory-server's projector consumer. When a TD finalizes
 * a matchUp (sets `winningSide` or `matchUpStatus = 'COMPLETED'`),
 * score-relay marks every active crowd session for that matchUp as
 * `cancelled-by-td-finalize`. Decision 6.
 *
 * Server-to-server auth uses a shared secret, NOT JWT, via the
 * `X-Internal-Secret` header matched against `INTERNAL_WEBHOOK_SECRET`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CrowdScoringStorage } from './storage.js';

const INTERNAL_SECRET_HEADER = 'x-internal-secret';

export interface WebhookReceiverOptions {
  storage: CrowdScoringStorage;
  /** Shared secret expected on the `X-Internal-Secret` header. */
  secret: string;
  logger?: (message: string) => void;
}

interface MatchUpFinalizedBody {
  matchUpId?: unknown;
}

export function createMatchUpFinalizedHandler(opts: WebhookReceiverOptions) {
  const log = opts.logger ?? ((m: string) => console.log(`[crowd-webhook] ${m}`));
  if (!opts.secret) {
    throw new Error('createMatchUpFinalizedHandler: secret is required');
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      respondJson(res, 405, { error: 'method-not-allowed' });
      return;
    }

    const provided = req.headers[INTERNAL_SECRET_HEADER];
    if (typeof provided !== 'string' || provided !== opts.secret) {
      log('rejected request: missing/wrong internal secret');
      respondJson(res, 401, { error: 'unauthorized' });
      return;
    }

    let body: MatchUpFinalizedBody;
    try {
      body = await readJsonBody(req);
    } catch {
      respondJson(res, 400, { error: 'invalid-json' });
      return;
    }

    if (typeof body.matchUpId !== 'string' || body.matchUpId.length === 0) {
      respondJson(res, 400, { error: 'matchUpId-required' });
      return;
    }

    try {
      const cancelled = await opts.storage.cancelByMatchUpId(body.matchUpId);
      log(`matchUp ${body.matchUpId} finalized → cancelled ${cancelled} active session(s)`);
      respondJson(res, 200, { matchUpId: body.matchUpId, cancelled });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`storage error cancelling matchUp ${body.matchUpId}: ${message}`);
      respondJson(res, 500, { error: 'storage-error' });
    }
  };
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KB — bodies are tiny

async function readJsonBody(req: IncomingMessage): Promise<MatchUpFinalizedBody> {
  return await new Promise<MatchUpFinalizedBody>((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on('error', reject);
  });
}
