import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = new Map<string, (() => void)[]>();
  const socket = {
    connected: true,
    active: true,
    emit: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() },
    on: vi.fn((event: string, callback: () => void) => handlers.set(event, [...(handlers.get(event) ?? []), callback])),
  };
  return { socket, handlers };
});
vi.mock('socket.io-client', () => ({ io: () => h.socket }));
import { disconnectAll, sendIntennseUpdate, sendTeamBranding } from '../scoreRelay';
import { brandingFromSides } from '../../teamBranding';

const frame = { matchUpId: 'one', teams: { 1: { participantId: 'a', colors: { primary: '#ffffff' } } } };
beforeEach(() => {
  disconnectAll();
  h.socket.emit.mockClear();
  h.handlers.clear();
  h.socket.connected = true;
});
const frames = () => h.socket.emit.mock.calls.filter(([event]) => event === 'teamBranding').map(([, data]) => data);

it('deduplicates static metadata, strips it from per-point frames, and replays on reconnect', () => {
  for (let i = 0; i < 10; i++) sendIntennseUpdate({ matchUpId: 'one', teamBranding: frame, boltScore: i });
  expect(frames()).toHaveLength(1);
  expect(
    h.socket.emit.mock.calls.filter(([event]) => event === 'intennse').every(([, data]) => !data.teamBranding),
  ).toBe(true);
  for (const callback of h.handlers.get('connect') ?? []) callback();
  expect(frames()).toHaveLength(2);
  sendTeamBranding({ matchUpId: 'one', teams: {} });
  expect(frames().pop()?.teams).toEqual({});
});
it('retains only the current match while offline and reconnects with its complete replacement', () => {
  h.socket.connected = false;
  sendTeamBranding(frame);
  sendTeamBranding({ matchUpId: 'two', teams: {} });
  expect(frames()).toHaveLength(0);
  h.socket.connected = true;
  for (const callback of h.handlers.get('connect') ?? []) callback();
  expect(frames()).toEqual([{ matchUpId: 'two', teams: {} }]);
});
it('maps by canonical side and TEAM identity while omitting invalid/private colors', () => {
  const result = brandingFromSides('one', undefined, [
    { sideNumber: 2, participant: { participantId: 'b', participantType: 'TEAM', teamColors: { primary: '#aabbcc' } } },
    {
      sideNumber: 1,
      participant: { participantId: 'player', participantType: 'PAIR', teamColors: { primary: '#ffffff' } },
    },
  ]);
  expect(result.teams).toEqual({ 2: { participantId: 'b', colors: { primary: '#AABBCC' } } });
  expect(
    brandingFromSides('one', undefined, [{ sideNumber: 1, teamParticipant: { participantId: 'team' } }]).teams,
  ).toEqual({ 1: { participantId: 'team' } });
});

it('does not publish an explicitly non-TEAM hydrated identity', () => {
  expect(
    brandingFromSides('one', undefined, [
      {
        sideNumber: 1,
        teamParticipant: {
          participantId: 'pair',
          participantType: 'PAIR',
          teamColors: { primary: '#FFFFFF' },
        },
      },
    ]).teams,
  ).toEqual({});
});
