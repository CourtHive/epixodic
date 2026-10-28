/**
 * `/chat` — tournament chat delivery (Mentat/planning/CHAT_TO_AMS.md § 5).
 *
 * courthive-ams (AMS) owns chat: it stores every message, decides who may chat, and orders messages by `seq`. The
 * relay is display fan-out only. It stores nothing and decides no access; it admits a socket to a tournament's room
 * on a room token AMS signed (ES256, by `kid`, `aud: 'chat'`), and it emits what AMS publishes to it
 * (`chatPublish.ts`). History and gap fill come from AMS, never from here, so a relay restart loses no message.
 *
 *   joinChat { token }  → ack { ok: true, tournamentId, admin } | { ok: false, error }
 *   chatMessage         → `chat:<tournamentId>`, every message AMS stored
 *   chatPresence        → `chat:<tournamentId>`, { tournamentId, count } on join, leave and disconnect
 *   adminChatFeed       → `chat:admin`, every message in every tournament (a token with `adm: true`)
 *
 * A socket is in one tournament's room at a time: joining another leaves the first. Expiry is checked at join only;
 * a client whose token has expired re-mints one from AMS when it next has to join (after a reconnect).
 */

import { JwtVerificationError, verifyEs256 } from '../crowd/jwtVerify.js';
import { createPublicKey, type KeyObject } from 'node:crypto';
import type { Namespace, Server, Socket } from 'socket.io';

export const CHAT_NAMESPACE = '/chat';
export const CHAT_AUDIENCE = 'chat';
export const ADMIN_ROOM = 'chat:admin';

export const tournamentRoom = (tournamentId: string) => `chat:${tournamentId}`;

export type ChatJoinAnswer = { ok: true; tournamentId: string; admin: boolean } | { ok: false; error: string };

/** A stored message as AMS publishes it: the wire message plus the identity the admin monitor groups by. */
export interface PublishedChatMessage {
  tournamentId: string;
  seq: number;
  userName: string;
  message: string;
  timestamp: number;
  clientMsgId?: string;
  isAdmin?: boolean;
  providerId?: string;
  providerAbbr?: string;
  tournamentName?: string;
}

export interface ChatDelivery {
  /** Emit one stored message to its tournament's room, and to the admin room. */
  publish: (message: PublishedChatMessage) => void;
}

/**
 * AMS's public verify key from the environment (`AMS_JWT_PUBLIC_KEY` + `AMS_JWT_KID`), kept apart from CFS's
 * `JWT_PUBLIC_KEY`: a CFS-signed token must never open a chat room, and an AMS room token must never pass as a CFS
 * session. Tolerates literal `\n` in the PEM. Empty when unconfigured.
 */
export function loadChatKeys(env: NodeJS.ProcessEnv = process.env): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const pem = env.AMS_JWT_PUBLIC_KEY?.trim();
  const kid = env.AMS_JWT_KID?.trim();
  if (pem && kid) keys.set(kid, createPublicKey(pem.replace(/\\n/g, '\n')));
  return keys;
}

/** Verify a room token: AMS's signature, the chat audience, unexpired, naming a tournament and a user. */
export function verifyRoomToken(
  token: unknown,
  keys: Map<string, KeyObject>,
  now?: number,
): { tournamentId: string; userId: string; admin: boolean } {
  if (typeof token !== 'string') throw new JwtVerificationError('token-required');
  const claims = verifyEs256(token, keys, { expectedAudiences: [CHAT_AUDIENCE], now });
  const tournamentId = typeof claims.tid === 'string' ? claims.tid : '';
  const userId = typeof claims.sub === 'string' ? claims.sub : '';
  if (!tournamentId) throw new JwtVerificationError('missing-tid');
  if (!userId) throw new JwtVerificationError('missing-sub');
  if (typeof claims.exp !== 'number') throw new JwtVerificationError('missing-exp');
  return { tournamentId, userId, admin: claims.adm === true };
}

const errorOf = (err: unknown) => (err instanceof JwtVerificationError ? err.reason : 'internal-error');

export function attachChatNamespace(opts: {
  io: Server;
  keys: Map<string, KeyObject>;
  log?: (message: string) => void;
}): ChatDelivery {
  const log = opts.log ?? ((message: string) => console.log(`[chat] ${message}`));
  const ns: Namespace = opts.io.of(CHAT_NAMESPACE);

  const emitPresence = (tournamentId: string) => {
    const count = ns.adapter.rooms.get(tournamentRoom(tournamentId))?.size ?? 0;
    ns.to(tournamentRoom(tournamentId)).emit('chatPresence', { tournamentId, count });
  };

  const leaveTournament = (socket: Socket) => {
    const previous: string | undefined = socket.data.chatTournamentId;
    if (!previous) return;
    socket.leave(tournamentRoom(previous));
    socket.data.chatTournamentId = undefined;
    emitPresence(previous);
  };

  ns.on('connection', (socket) => {
    socket.on('joinChat', (data: unknown, ack: unknown) => {
      const answer = (reply: ChatJoinAnswer) => {
        if (typeof ack === 'function') ack(reply);
      };
      try {
        const { tournamentId, userId, admin } = verifyRoomToken((data as { token?: unknown })?.token, opts.keys);
        if (socket.data.chatTournamentId !== tournamentId) leaveTournament(socket);
        socket.join(tournamentRoom(tournamentId));
        socket.data.chatTournamentId = tournamentId;
        socket.data.chatUserId = userId;
        if (admin) socket.join(ADMIN_ROOM);
        else socket.leave(ADMIN_ROOM);
        answer({ ok: true, tournamentId, admin });
        emitPresence(tournamentId);
      } catch (err) {
        answer({ ok: false, error: errorOf(err) });
      }
    });

    socket.on('leaveChat', () => {
      try {
        leaveTournament(socket);
        socket.leave(ADMIN_ROOM);
      } catch (err) {
        log(`leaveChat failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Rooms are left on disconnect; the count the remaining members see is taken after.
    socket.on('disconnect', () => {
      const tournamentId: string | undefined = socket.data.chatTournamentId;
      if (tournamentId) emitPresence(tournamentId);
    });
  });

  return {
    publish: (message) => {
      const { providerId, providerAbbr, tournamentName, ...wire } = message;
      ns.to(tournamentRoom(message.tournamentId)).emit('chatMessage', wire);
      ns.to(ADMIN_ROOM).emit('adminChatFeed', { ...wire, providerId, providerAbbr, tournamentName });
    },
  };
}
