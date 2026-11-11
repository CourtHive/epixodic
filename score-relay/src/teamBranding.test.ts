import { getActiveMatchIds, getMatch, pruneStaleMatches, removeMatch, updateMatch } from './matchUpStore.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { parseTeamBranding } from './teamBranding.js';
import { signHs256 } from './crowd/jwtVerify.js';
import { createRelay } from './relay.js';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const SECRET = 'team-branding-test';
const frame = {
  matchUpId: 'one',
  tournamentId: 't',
  teams: {
    1: {
      participantId: 'alpha',
      participantName: 'Alpha',
      colors: { roles: { 'team.accent': '#aabbcc', 'team.surface': '#112233' } },
    },
    2: { participantId: 'beta', participantName: 'Beta' },
  },
};
const clients: Socket[] = [];
const http = createServer();
const io = new Server(http);
let origin: string;
function event(socket: Socket, name: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${name}`)), 2000);
    socket.once(name, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
async function client(namespace: string, tournamentId?: string) {
  const token = signHs256(
    { sub: 'branding-producer', aud: tournamentId ? 'score' : 'admin', ...(tournamentId && { tournamentId }) },
    SECRET,
  );
  const socket = connect(`${origin}/${namespace}`, { transports: ['websocket'], forceNew: true, auth: { token } });
  clients.push(socket);
  await event(socket, 'connect');
  return socket;
}
async function publish(socket: Socket, data: any) {
  const ack = event(socket, 'ack');
  socket.emit('teamBranding', data);
  await ack;
}

beforeAll(async () => {
  createRelay(io, {
    port: 0,
    persistScores: false,
    corsOrigin: '*',
    staleMatchHours: 4,
    pruneIntervalMinutes: 30,
    trackerJwtSecret: SECRET,
    trackerRequireAuth: true,
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (typeof address !== 'object' || !address) throw new Error('No relay address');
  origin = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  for (const id of getActiveMatchIds()) removeMatch(id);
});
afterEach(() => {
  for (const socket of clients.splice(0)) socket.disconnect();
});
afterAll(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  http.close();
});

describe('teamBranding delivery and lifecycle', () => {
  it('caches while idle and replays normalized metadata to late match, tournament and all subscribers', async () => {
    const tracker = await client('tracker');
    await publish(tracker, frame);
    updateMatch({ matchUpId: 'one', tournamentId: 't', score: { sets: [] } });
    for (const [subscribe, id] of [
      ['subscribe', 'one'],
      ['subscribe:tournament', 't'],
      ['subscribe:all', undefined],
    ]) {
      const listener = await client('live');
      const received = event(listener, 'teamBranding');
      listener.emit(subscribe!, id);
      expect(await received).toEqual(parseTeamBranding(frame));
    }
  });
  it('broadcasts updates and explicit clears without a point or timer event', async () => {
    const tracker = await client('tracker');
    const listener = await client('live');
    listener.emit('subscribe', 'one');
    let received = event(listener, 'teamBranding');
    await publish(tracker, frame);
    expect((await received).teams[1].participantId).toBe('alpha');
    received = event(listener, 'teamBranding');
    await publish(tracker, { ...frame, teams: {} });
    expect((await received).teams).toEqual({});
    expect(getMatch('one')?.teamBranding?.teams).toEqual({});
  });
  it('refuses invalid replacements and tournament mismatch, and stamps JWT tournament scope', async () => {
    const tracker = await client('tracker', 't');
    await publish(tracker, frame);
    const previous = JSON.stringify(getMatch('one'));
    for (const invalid of [
      { ...frame, teams: { 1: { participantId: 'alpha', colors: { roles: { 'team.accent': 'red' } } } } },
      { ...frame, tournamentId: 'other' },
    ]) {
      const rejected = event(tracker, 'error');
      tracker.emit('teamBranding', invalid);
      expect((await rejected).message).toBeTruthy();
      expect(JSON.stringify(getMatch('one'))).toBe(previous);
    }
    await publish(tracker, { matchUpId: 'scoped', teams: {} });
    expect(getMatch('scoped')?.teamBranding?.tournamentId).toBe('t');
  });
  it('uses the existing metadata control rate limit before changing cached state', async () => {
    const tracker = await client('tracker');
    const rejected = event(tracker, 'rejected');
    for (let index = 0; index < 11; index++)
      tracker.emit('teamBranding', {
        matchUpId: 'rate-limit',
        teams: { 1: { participantId: `team-${index}` } },
      });
    expect((await rejected).reason).toBe('rate-limited');
    expect(getMatch('rate-limit')?.teamBranding?.teams[1]?.participantId).toBe('team-9');
  });
  it('removes metadata with stale/removed matches and accepts producer replay after restart', async () => {
    const tracker = await client('tracker');
    await publish(tracker, frame);
    expect(pruneStaleMatches(-1)).toBe(1);
    expect(getMatch('one')).toBeUndefined();
    await publish(tracker, frame);
    expect(getMatch('one')?.teamBranding).toEqual(parseTeamBranding(frame));
    removeMatch('one');
    expect(getMatch('one')).toBeUndefined();
    expect(getMatch('unbranded-legacy')).toBeUndefined();
  });
  it.each([
    ['pruned', () => expect(pruneStaleMatches(-1)).toBe(1)],
    ['removed', () => removeMatch('one')],
  ])('stops replaying branding once its match is %s', async (_, drop) => {
    const tracker = await client('tracker');
    await publish(tracker, frame);
    drop();
    // A later score for the same id must not resurrect the dropped branding.
    updateMatch({ matchUpId: 'one', tournamentId: 't', score: { sets: [] } });
    const listener = await client('live');
    const replayed: unknown[] = [];
    listener.on('teamBranding', (data) => replayed.push(data));
    const score = event(listener, 'score');
    listener.emit('subscribe', 'one');
    listener.emit('subscribe:tournament', 't');
    // Frames arrive in order, so `active` lands after every replay the earlier subscribes produced.
    const active = event(listener, 'active');
    listener.emit('subscribe:all');
    await score;
    expect(await active).toEqual(['one']);
    expect(replayed).toEqual([]);
  });
  it('rate-limits malformed snapshots before validating them, so refusals cannot flood', async () => {
    const tracker = await client('tracker');
    const errors: unknown[] = [];
    tracker.on('error', (data) => errors.push(data));
    const rejected = event(tracker, 'rejected');
    for (let index = 0; index < 11; index++)
      tracker.emit('teamBranding', { matchUpId: 'malformed', teams: { 1: { participantId: '' } } });
    expect(await rejected).toMatchObject({ matchUpId: 'malformed', reason: 'rate-limited' });
    expect(errors).toHaveLength(10);
    expect(getMatch('malformed')).toBeUndefined();
  });
  it('rate-limits frames refused for a missing matchUpId against the sender, not a claimed match', async () => {
    const tracker = await client('tracker');
    const rejected = event(tracker, 'rejected');
    for (let index = 0; index < 11; index++) tracker.emit('teamBranding', { teams: {} });
    expect((await rejected).reason).toBe('rate-limited');
    // The sender's refusals spent no token from a real match's bucket.
    await publish(tracker, frame);
    expect(getMatch('one')?.teamBranding).toEqual(parseTeamBranding(frame));
  });
});

it('refuses invalid side numbering, duplicate identities, unknown color keys and malformed hex', () => {
  for (const teams of [
    [],
    { 0: { participantId: 'a' } },
    { 1: { participantId: 'a' }, 2: { participantId: 'a' } },
    { 1: { participantId: 'a', colors: {} } },
    { 1: { participantId: 'a', colors: { primary: '#ffffff', textColor: '#000000' } } },
  ]) {
    expect(parseTeamBranding({ matchUpId: 'one', teams })).toBeUndefined();
  }
});
