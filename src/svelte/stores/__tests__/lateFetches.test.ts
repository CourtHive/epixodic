import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each API call returns a promise the test settles by hand, so responses can be
// made to arrive in any order.
const { pending } = vi.hoisted(() => ({ pending: [] as Array<{ args: any[]; resolve: (value: any) => void }> }));
function controlled(...args: any[]) {
  return new Promise((resolve) => pending.push({ args, resolve }));
}
vi.mock('../../services/factoryApi', () => ({
  getEventData: (...args: any[]) => controlled(...args),
  getScheduledMatchUps: (...args: any[]) => controlled(...args),
  getTournamentInfo: (...args: any[]) => controlled(...args),
}));
vi.mock('../../../state/browserStorage', () => ({
  browserStorage: { get: () => undefined, set: () => {}, remove: () => {} },
}));
vi.mock('../localScoreOverlay.svelte', () => ({ localScoreVersion: () => 0, overlayLocalScore: (m: any) => m }));

import { clearScheduledMatchUps, fetchScheduledMatchUps, getScheduledMatchUpsState } from '../scheduledMatchUps.svelte';
import { clearTournaments, fetchTournamentInfo, getTournamentsState } from '../tournaments.svelte';
import { clearEventData, fetchEventMatchUps, getEventDataState } from '../eventData.svelte';

function respond(index: number, data: any) {
  pending[index].resolve({ data });
}

const eventPayload = (eventId: string) => ({
  eventData: { eventInfo: { eventId }, drawsData: [] },
  participants: [{ participantId: `p-${eventId}` }],
});

beforeEach(() => {
  pending.length = 0;
  clearEventData();
  clearScheduledMatchUps();
  clearTournaments();
});

describe('a late response does not overwrite the current selection', () => {
  it('event data: A answering after B leaves B selected with B data', async () => {
    const a = fetchEventMatchUps('t', 'A');
    const b = fetchEventMatchUps('t', 'B');
    respond(1, eventPayload('B'));
    await b;
    respond(0, eventPayload('A'));
    await a;

    const state = getEventDataState() as any;
    expect(state.eventId).toBe('B');
    expect(state.participants.map((p: any) => p.participantId)).toEqual(['p-B']);
  });

  it('event data: a response after clear does not repopulate', async () => {
    const a = fetchEventMatchUps('t', 'A');
    clearEventData();
    respond(0, eventPayload('A'));
    await a;
    expect((getEventDataState() as any).participants).toEqual([]);
  });

  it('schedule: the older request answering last is ignored', async () => {
    const first = fetchScheduledMatchUps('t1');
    const second = fetchScheduledMatchUps('t2');
    respond(1, { dateMatchUps: [{ matchUpId: 'from-t2' }] });
    await second;
    respond(0, { dateMatchUps: [{ matchUpId: 'from-t1' }] });
    await first;
    expect(getScheduledMatchUpsState().dateMatchUps?.map((m: any) => m.matchUpId)).toEqual(['from-t2']);
  });

  it('schedule: a response after clear does not repopulate', async () => {
    const first = fetchScheduledMatchUps('t1');
    clearScheduledMatchUps();
    respond(0, { dateMatchUps: [{ matchUpId: 'late' }] });
    await first;
    expect(getScheduledMatchUpsState().data).toBeUndefined();
  });

  it('tournaments: a response after clear does not repopulate the list', async () => {
    const first = fetchTournamentInfo('t1');
    clearTournaments();
    respond(0, { tournamentId: 't1', tournamentName: 'T1' });
    await first;
    expect(getTournamentsState().list).toEqual([]);
  });

  it('tournaments: two concurrent fetches of one id add it once', async () => {
    const first = fetchTournamentInfo('t1');
    const second = fetchTournamentInfo('t1');
    respond(0, { tournamentId: 't1' });
    respond(1, { tournamentId: 't1' });
    await Promise.all([first, second]);
    expect(getTournamentsState().list).toHaveLength(1);
  });
});
