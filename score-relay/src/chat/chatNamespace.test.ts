/**
 * /chat namespace and the chat-publish route, against an in-process Socket.IO server on a random port with real
 * socket.io clients and ES256 room tokens signed the way courthive-ams signs them. No database: the relay stores
 * no chat.
 */

import { attachChatNamespace, loadChatKeys, type ChatJoinAnswer } from './chatNamespace.js';
import { asPublishedMessage, createChatPublishHandler } from './chatPublish.js';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { signEs256 } from '../crowd/jwtVerify.js';
import { Server as IoServer } from 'socket.io';

const KID = 'ams-chat-test';
const SECRET = 'chat-publish-test-secret';
const T = 'tournament-t';
const U = 'tournament-u';

const amsKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const strangerKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const nowSeconds = () => Math.floor(Date.now() / 1000);

function roomToken(
  claims: Record<string, unknown> = {},
  { key = amsKeys.privateKey, kid = KID }: { key?: KeyObject; kid?: string } = {},
): string {
  return signEs256({ aud: 'chat', sub: 'user-a', tid: T, exp: nowSeconds() + 600, ...claims }, key, kid);
}

const message = (overrides: Record<string, unknown> = {}) => ({
  tournamentId: T,
  seq: 7,
  userName: 'a@guidon.test',
  message: 'hello',
  timestamp: 1_800_000_000_000,
  clientMsgId: 'c-1',
  isAdmin: false,
  providerId: 'P',
  providerAbbr: 'PRV',
  tournamentName: 'T Open',
  ...overrides,
});

describe('/chat namespace', () => {
  let httpServer: HttpServer;
  let io: IoServer;
  let port: number;
  let clients: ClientSocket[];

  beforeEach(async () => {
    clients = [];
    httpServer = createServer();
    io = new IoServer(httpServer);
    const keys = loadChatKeys({
      AMS_JWT_PUBLIC_KEY: amsKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      AMS_JWT_KID: KID,
    } as NodeJS.ProcessEnv);
    const delivery = attachChatNamespace({ io, keys, log: () => {} });
    const publish = createChatPublishHandler({ delivery, secret: SECRET, log: () => {} });
    httpServer.on('request', (req, res) => {
      if (req.url === '/api/internal/chat-publish') void publish(req, res);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  async function connect(): Promise<ClientSocket> {
    const socket = ioClient(`http://127.0.0.1:${port}/chat`, { transports: ['websocket'], reconnection: false });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }

  const join = (socket: ClientSocket, token: unknown) =>
    new Promise<ChatJoinAnswer>((resolve) => socket.emit('joinChat', { token }, resolve));

  function collect(socket: ClientSocket, event: string): any[] {
    const seen: any[] = [];
    socket.on(event, (payload) => seen.push(payload));
    return seen;
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  const post = (body: unknown, secret: string | null = SECRET) =>
    fetch(`http://127.0.0.1:${port}/api/internal/chat-publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret === null ? {} : { 'X-Internal-Secret': secret }) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('admits a room token AMS signed, into that tournament and no other', async () => {
    const a = await connect();
    expect(await join(a, roomToken())).toEqual({ ok: true, tournamentId: T, admin: false });
  });

  it.each([
    ['expired', () => roomToken({ exp: nowSeconds() - 1 })],
    ['bad-signature', () => roomToken({}, { key: strangerKeys.privateKey })],
    ['unknown-key', () => roomToken({}, { kid: 'some-other-kid' })],
    ['audience-mismatch', () => roomToken({ aud: 'admin' })],
    ['missing-tid', () => roomToken({ tid: undefined })],
    ['missing-sub', () => roomToken({ sub: undefined })],
    ['missing-exp', () => roomToken({ exp: undefined })],
    ['token-required', () => undefined],
  ])('refuses a token: %s', async (reason, token) => {
    const a = await connect();
    expect(await join(a, token())).toEqual({ ok: false, error: reason });
  });

  it('refuses an HS256 token, whatever it claims: only AMS signs room tokens', async () => {
    const a = await connect();
    const hs = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJjaGF0Iiwic3ViIjoieCIsInRpZCI6InRvdXJuYW1lbnQtdCJ9.x';
    expect(await join(a, hs)).toEqual({ ok: false, error: 'unsupported-algorithm:HS256' });
  });

  it('counts presence per room, on join, on switching tournaments and on disconnect', async () => {
    const a = await connect();
    const b = await connect();
    const seenByA = collect(a, 'chatPresence');
    await join(a, roomToken());
    await join(b, roomToken({ sub: 'user-b' }));
    await settle();
    expect(seenByA.at(-1)).toEqual({ tournamentId: T, count: 2 });

    await join(b, roomToken({ sub: 'user-b', tid: U }));
    await settle();
    expect(seenByA.at(-1), 'B left T for U').toEqual({ tournamentId: T, count: 1 });

    await join(b, roomToken({ sub: 'user-b' }));
    await settle();
    expect(seenByA.at(-1)).toEqual({ tournamentId: T, count: 2 });
    b.disconnect();
    await settle();
    expect(seenByA.at(-1), 'after B disconnected').toEqual({ tournamentId: T, count: 1 });
  });

  it("publishes a stored message to its tournament's room and to the admin room, and nowhere else", async () => {
    const a = await connect();
    const other = await connect();
    const admin = await connect();
    const outsider = await connect();
    await join(a, roomToken());
    await join(other, roomToken({ sub: 'user-u', tid: U }));
    expect(await join(admin, roomToken({ sub: 'root', tid: U, adm: true }))).toEqual({
      ok: true,
      tournamentId: U,
      admin: true,
    });
    const toA = collect(a, 'chatMessage');
    const toOther = collect(other, 'chatMessage');
    const toOutsider = collect(outsider, 'chatMessage');
    const feed = collect(admin, 'adminChatFeed');

    const response = await post(message());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ published: true, seq: 7 });
    await settle();

    expect(toA).toEqual([
      {
        tournamentId: T,
        seq: 7,
        userName: 'a@guidon.test',
        message: 'hello',
        timestamp: 1_800_000_000_000,
        clientMsgId: 'c-1',
        isAdmin: false,
      },
    ]);
    expect(toOther, 'another tournament').toEqual([]);
    expect(toOutsider, 'a socket that never joined').toEqual([]);
    expect(feed).toEqual([{ ...toA[0], providerId: 'P', providerAbbr: 'PRV', tournamentName: 'T Open' }]);
  });

  it('a non-admin token takes a socket out of the admin room', async () => {
    const socket = await connect();
    await join(socket, roomToken({ adm: true }));
    await join(socket, roomToken());
    const feed = collect(socket, 'adminChatFeed');
    await post(message());
    await settle();
    expect(feed).toEqual([]);
  });

  it('refuses a publish without the internal secret, or with the wrong one', async () => {
    expect((await post(message(), null)).status).toBe(401);
    expect((await post(message(), 'wrong')).status).toBe(401);
  });

  it('refuses a publish that is not a stored message', async () => {
    expect((await post('{not json')).status).toBe(400);
    expect((await post(message({ seq: undefined }))).status).toBe(400);
    expect((await post(message({ tournamentId: '' }))).status).toBe(400);
  });
});

describe('asPublishedMessage', () => {
  it('keeps the wire fields and drops anything else', () => {
    expect(asPublishedMessage({ ...message(), injected: '<script>' })).toEqual(message());
  });

  it('treats only a literal true as an admin message', () => {
    expect(asPublishedMessage(message({ isAdmin: 'yes' }))?.isAdmin).toBe(false);
  });
});

describe('loadChatKeys', () => {
  it('is empty without both the key and its kid', () => {
    expect(loadChatKeys({} as NodeJS.ProcessEnv).size).toBe(0);
    expect(loadChatKeys({ AMS_JWT_KID: KID } as NodeJS.ProcessEnv).size).toBe(0);
  });
});
