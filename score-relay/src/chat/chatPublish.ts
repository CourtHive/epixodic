/**
 * `POST /api/internal/chat-publish` — courthive-ams hands the relay a message it has stored, and the relay emits it
 * on `/chat` (chatNamespace.ts). Server to server, with the same `X-Internal-Secret` the matchup-finalized webhook
 * takes (`INTERNAL_WEBHOOK_SECRET`).
 *
 * Only a stored message arrives here: AMS publishes after its insert, with the `seq` it assigned. A message that is
 * never published is still stored and still acknowledged to its sender; recipients catch up through AMS's gap fill.
 */

import type { ChatDelivery, PublishedChatMessage } from './chatNamespace.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

const INTERNAL_SECRET_HEADER = 'x-internal-secret';
const MAX_BODY_BYTES = 64 * 1024;

export function createChatPublishHandler(opts: {
  delivery: ChatDelivery;
  secret: string;
  log?: (message: string) => void;
}) {
  const log = opts.log ?? ((message: string) => console.log(`[chat-publish] ${message}`));
  if (!opts.secret) throw new Error('createChatPublishHandler: secret is required');

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') return respondJson(res, 405, { error: 'method-not-allowed' });

    const provided = req.headers[INTERNAL_SECRET_HEADER];
    if (typeof provided !== 'string' || provided !== opts.secret) {
      log('rejected request: missing/wrong internal secret');
      return respondJson(res, 401, { error: 'unauthorized' });
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      return respondJson(res, 400, { error: 'invalid-json' });
    }

    const message = asPublishedMessage(body);
    if (!message) return respondJson(res, 400, { error: 'invalid-message' });

    opts.delivery.publish(message);
    respondJson(res, 200, { published: true, seq: message.seq });
  };
}

/** The fields the wire needs, each of the right type; anything else is not a message AMS stored. */
export function asPublishedMessage(body: unknown): PublishedChatMessage | undefined {
  const b = body as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object') return undefined;
  const required =
    typeof b.tournamentId === 'string' &&
    b.tournamentId.length > 0 &&
    typeof b.seq === 'number' &&
    typeof b.userName === 'string' &&
    typeof b.message === 'string' &&
    typeof b.timestamp === 'number';
  if (!required) return undefined;
  const optionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return {
    tournamentId: b.tournamentId as string,
    seq: b.seq as number,
    userName: b.userName as string,
    message: b.message as string,
    timestamp: b.timestamp as number,
    clientMsgId: optionalString(b.clientMsgId),
    isAdmin: b.isAdmin === true,
    providerId: optionalString(b.providerId),
    providerAbbr: optionalString(b.providerAbbr),
    tournamentName: optionalString(b.tournamentName),
  };
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
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
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {});
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on('error', reject);
  });
}
