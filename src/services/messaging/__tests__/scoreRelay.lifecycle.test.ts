import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Socket.IO client: each io() call builds a new socket that starts
// DISCONNECTED and records its handshake options, handlers and emits, so the
// tests can drive connect/reconnect by hand.
const { created, ioMock, stored } = vi.hoisted(() => {
  const created: any[] = [];
  const stored: { token?: string } = {};
  const ioMock = vi.fn((url: string, opts: any) => {
    const handlers = new Map<string, Array<(...args: any[]) => void>>();
    const socket: any = {
      url,
      opts,
      connected: false,
      active: true,
      emit: vi.fn(),
      on: vi.fn((event: string, fn: any) => {
        handlers.set(event, [...(handlers.get(event) ?? []), fn]);
        return socket;
      }),
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(() => {
        socket.connected = false;
      }),
      io: { on: vi.fn() },
      fire(event: string, ...args: any[]) {
        if (event === 'connect') socket.connected = true;
        for (const fn of handlers.get(event) ?? []) fn(...args);
      },
    };
    created.push(socket);
    return socket;
  });
  return { created, ioMock, stored };
});
vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('../../../state/browserStorage', () => ({
  browserStorage: { get: () => stored.token },
}));

import {
  disconnectAll,
  onRelayStatusChange,
  sendClockSync,
  sendIntennseUpdate,
  sendScore,
  subscribeToAll,
  subscribeToMatch,
} from '../scoreRelay';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).split('=')[0].replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function handshakeAuth(socket: any): Record<string, unknown> {
  let auth: Record<string, unknown> = {};
  socket.opts.auth((value: Record<string, unknown>) => (auth = value));
  return auth;
}

const trackers = () => created.filter((s) => s.url.endsWith('/tracker'));
const listeners = () => created.filter((s) => s.url.endsWith('/live'));

beforeEach(() => {
  disconnectAll();
  created.length = 0;
  stored.token = undefined;
});
afterEach(() => disconnectAll());

describe('tracker socket ownership', () => {
  it('builds one tracker socket however many frames are sent before it connects', () => {
    sendScore({ matchUpId: 'm', score: {} });
    sendIntennseUpdate({ matchUpId: 'm' });
    sendClockSync({ matchUpId: 'm', boltTimerRemainingMs: 1, serveClockRemainingMs: 1, clockState: 'paused' });
    expect(trackers()).toHaveLength(1);
    expect(trackers()[0].emit).toHaveBeenCalledTimes(3);
  });

  it('builds a fresh socket only after disconnectAll', () => {
    sendScore({ matchUpId: 'm', score: {} });
    disconnectAll();
    sendScore({ matchUpId: 'm', score: {} });
    expect(trackers()).toHaveLength(2);
    expect(trackers()[0].disconnect).toHaveBeenCalled();
  });
});

// A middleware refusal leaves the socket inactive: Socket.IO will not reconnect it by itself.
function refuse(socket: any, reason: string) {
  socket.active = false;
  socket.fire('connect_error', new Error(reason));
}

describe('tracker handshake refusals', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const freshToken = () => jwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 600 });

  // A strict relay refuses a tokenless handshake every time; retrying on a timer
  // was an unbounded loop (prod 2026-11-17: 249 refusals from one open tab).
  it('does not retry a tokenless handshake a strict relay refused', () => {
    let lastStatus: string | undefined;
    const unsubscribe = onRelayStatusChange((status) => (lastStatus = status));
    sendScore({ matchUpId: 'm', score: {} });
    const socket = trackers()[0];
    refuse(socket, 'missing-token');
    vi.advanceTimersByTime(10 * 60_000);
    expect(socket.connect).not.toHaveBeenCalled();
    expect(lastStatus).toBe('unauthorized');
    unsubscribe();
  });

  it('reconnects once a sign-in stores a token the relay accepts, re-reading it', () => {
    sendScore({ matchUpId: 'm', score: {} });
    const socket = trackers()[0];
    refuse(socket, 'missing-token');
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
    stored.token = freshToken();
    vi.advanceTimersByTime(5_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(handshakeAuth(socket)).toEqual({ token: stored.token });
  });

  it('does not re-present a token the relay refused, but presents a refreshed one', () => {
    stored.token = freshToken();
    sendScore({ matchUpId: 'm', score: {} });
    const socket = trackers()[0];
    refuse(socket, 'bad-signature');
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
    stored.token = jwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 900 });
    vi.advanceTimersByTime(5_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('retries a rate-limited handshake with the same credential', () => {
    sendScore({ matchUpId: 'm', score: {} });
    const socket = trackers()[0];
    refuse(socket, 'connect-rate-limited');
    vi.advanceTimersByTime(5_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('stops waiting after disconnectAll', () => {
    sendScore({ matchUpId: 'm', score: {} });
    const socket = trackers()[0];
    refuse(socket, 'missing-token');
    disconnectAll();
    stored.token = freshToken();
    vi.advanceTimersByTime(60_000);
    expect(socket.connect).not.toHaveBeenCalled();
  });
});

describe('tracker handshake credentials', () => {
  it('presents an unexpired stored token', () => {
    stored.token = jwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 600 });
    sendScore({ matchUpId: 'm', score: {} });
    expect(handshakeAuth(trackers()[0])).toEqual({ token: stored.token });
  });

  // With a secret set and strict mode off, the relay admits a socket with NO
  // token but refuses one with a bad token, so an expired token must not be sent.
  it('presents nothing for an expired token', () => {
    stored.token = jwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) - 1 });
    sendScore({ matchUpId: 'm', score: {} });
    expect(handshakeAuth(trackers()[0])).toEqual({});
  });

  it('presents nothing for a malformed or absent token', () => {
    stored.token = 'not-a-jwt';
    sendScore({ matchUpId: 'm', score: {} });
    expect(handshakeAuth(trackers()[0])).toEqual({});
    stored.token = undefined;
    expect(handshakeAuth(trackers()[0])).toEqual({});
  });

  // The relay refuses a verified token without an admin or score audience, and
  // courthive-public leaves a hiveid-only token under the same storage key.
  it('presents a token only when the relay would accept its audience', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    sendScore({ matchUpId: 'm', score: {} });
    for (const aud of [undefined, 'admin', 'score', ['admin', 'hiveid']]) {
      stored.token = jwt({ userId: 'u', exp, aud });
      expect(handshakeAuth(trackers()[0])).toEqual({ token: stored.token });
    }
    for (const aud of ['hiveid', ['hiveid'], 'provider-selection']) {
      stored.token = jwt({ userId: 'u', exp, aud });
      expect(handshakeAuth(trackers()[0])).toEqual({});
    }
  });

  it('reads the token at each handshake, so a login after connecting is used on reconnect', () => {
    sendScore({ matchUpId: 'm', score: {} });
    expect(handshakeAuth(trackers()[0])).toEqual({});
    stored.token = jwt({ userId: 'u', exp: Math.floor(Date.now() / 1000) + 600 });
    expect(handshakeAuth(trackers()[0])).toEqual({ token: stored.token });
  });
});

describe('listener subscriptions', () => {
  it('rejoins every subscribed match on each connect', () => {
    subscribeToMatch('a', () => {});
    const socket = listeners()[0];
    socket.fire('connect');
    socket.fire('connect');
    const joins = socket.emit.mock.calls.filter(([event, id]: any[]) => event === 'subscribe' && id === 'a');
    expect(joins.length).toBeGreaterThanOrEqual(2);
  });

  it('routes a score only to the subscribers of its match', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const onAll = vi.fn();
    subscribeToMatch('a', onA);
    subscribeToMatch('b', onB);
    subscribeToAll(onAll);
    listeners()[0].fire('score', { matchUpId: 'b' });
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onAll).toHaveBeenCalledTimes(1);
  });

  it('leaves the room only when the last subscriber of a match unsubscribes', () => {
    const first = subscribeToMatch('a', () => {});
    const second = subscribeToMatch('a', () => {});
    const socket = listeners()[0];
    socket.fire('connect');
    const leaves = () => socket.emit.mock.calls.filter(([event]: any[]) => event === 'unsubscribe').length;
    first();
    expect(leaves()).toBe(0);
    second();
    expect(leaves()).toBe(1);
  });

  it('shares one listener socket across subscriptions', () => {
    subscribeToMatch('a', () => {});
    subscribeToMatch('b', () => {});
    subscribeToAll(() => {});
    expect(listeners()).toHaveLength(1);
  });
});
