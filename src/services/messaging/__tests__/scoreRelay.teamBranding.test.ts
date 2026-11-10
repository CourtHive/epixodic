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

const frame = {
  matchUpId: 'one',
  teams: { 1: { participantId: 'a', colors: { roles: { 'team.accent': '#ffffff' } } } },
};
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
    {
      sideNumber: 2,
      participant: {
        participantId: 'b',
        participantType: 'TEAM',
        teamColors: {
          palette: [{ colorId: 'accent', value: '#aabbcc' }],
          display: { roles: { 'team.accent': 'accent' } },
        },
      },
    },
    {
      sideNumber: 1,
      participant: {
        participantId: 'player',
        participantType: 'PAIR',
        teamColors: {
          palette: [{ colorId: 'accent', value: '#ffffff' }],
          display: { roles: { 'team.accent': 'accent' } },
        },
      },
    },
  ]);
  expect(result.teams).toEqual({ 2: { participantId: 'b', colors: { roles: { 'team.accent': '#AABBCC' } } } });
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
          teamColors: {
            palette: [{ colorId: 'accent', value: '#FFFFFF' }],
            display: { roles: { 'team.accent': 'accent' } },
          },
        },
      },
    ]).teams,
  ).toEqual({});
});

it('publishes only selected display values from a multi-color CODES palette', () => {
  const teamColors = {
    palette: [
      { colorId: 'red', value: '#ce1126', group: 'Primary' },
      { colorId: 'white', value: '#ffffff', group: 'Primary' },
      { colorId: 'black', value: '#000000', group: 'Primary' },
      { colorId: 'gold', value: '#fcd116', group: 'Primary' },
    ],
    display: { roles: { 'team.accent': 'gold', 'team.surface': 'red' } },
  };
  const side = { sideNumber: 1, teamParticipant: { participantId: 'team', teamColors } };
  const frame = brandingFromSides('one', undefined, [side]);
  sendTeamBranding(frame);
  expect(frames()).toEqual([
    {
      matchUpId: 'one',
      teams: {
        1: { participantId: 'team', colors: { roles: { 'team.accent': '#FCD116', 'team.surface': '#CE1126' } } },
      },
    },
  ]);
  expect(JSON.stringify(frames())).not.toContain('palette');
  expect(JSON.stringify(frames())).not.toContain('group');
  expect(
    brandingFromSides('one', undefined, [{ ...side, teamParticipant: { participantId: 'team' } }]).teams[1],
  ).not.toHaveProperty('colors');
});

it('carries named role overrides without producer theme decisions or palette metadata', () => {
  const team = {
    participantId: 'alpha',
    participantType: 'TEAM',
    teamColors: {
      palette: [
        { colorId: 'navy', value: '#13294B' },
        { colorId: 'white', value: '#FFFFFF' },
      ],
      display: { roles: { 'team.surface': 'navy', 'team.text': 'white' } },
    },
  };
  const frame = brandingFromSides('one', undefined, [{ sideNumber: 2, participant: team }], {
    roles: { 'score.surface': '#FFFFFF' },
    teams: { alpha: { roles: { 'team.surface': { theme: true as const } } } },
  });
  expect(frame.teams[2]?.colors).toEqual({ roles: { 'team.text': '#FFFFFF', 'score.surface': '#FFFFFF' } });
  expect(frame.teams[1]).toBeUndefined();
});
