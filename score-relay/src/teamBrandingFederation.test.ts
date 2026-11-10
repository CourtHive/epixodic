import { getActiveMatchIds, removeMatch, setTeamBranding } from './matchUpStore.js';
import { connectUpstream, disconnectUpstream } from './upstreamFederation.js';
import { afterEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const servers: Server[] = [];
afterEach(async () => {
  disconnectUpstream();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const id of getActiveMatchIds()) removeMatch(id);
});

async function upstream(port = 0) {
  const http = createServer();
  const server = new Server(http);
  servers.push(server);
  const metadata = new Promise<any>((resolve) =>
    server.of('/tracker').on('connection', (socket) => socket.on('teamBranding', resolve)),
  );
  await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
  const address = http.address();
  if (typeof address !== 'object' || !address) throw new Error('No address');
  return { server, metadata, port: address.port };
}

it('replays metadata across an upstream relay restart while no new points arrive', async () => {
  const snapshot = { matchUpId: 'idle', teams: { 1: { participantId: 'team', colors: { primary: '#AABBCC' } } } };
  setTeamBranding(snapshot);
  const first = await upstream();
  connectUpstream(`http://127.0.0.1:${first.port}`);
  expect(await first.metadata).toEqual(snapshot);
  await new Promise<void>((resolve) => first.server.close(() => resolve()));
  servers.splice(servers.indexOf(first.server), 1);
  const restarted = await upstream(first.port);
  expect(await restarted.metadata).toEqual(snapshot);
}, 10_000);
