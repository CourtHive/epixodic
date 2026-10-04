import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store's `data` is only populated via fetchScheduledMatchUps → factoryApi.
// Mock the API so we can seed a known `dateMatchUps` payload and exercise the
// date helpers directly.
vi.mock('../../services/factoryApi', () => ({
  getScheduledMatchUps: vi.fn(),
}));

import { getScheduledMatchUps } from '../../services/factoryApi';
import {
  fetchScheduledMatchUps,
  getMatchUpsForDate,
  getScheduledDates,
  clearScheduledMatchUps,
} from '../scheduledMatchUps.svelte';

const mk = (matchUpId: string, scheduledDate?: string) => ({
  matchUpId,
  sides: [],
  ...(scheduledDate && { schedule: { scheduledDate } }),
});

async function seed(dateMatchUps: any[]) {
  vi.mocked(getScheduledMatchUps).mockResolvedValue({ data: { dateMatchUps } });
  await fetchScheduledMatchUps('t1');
}

describe('scheduledMatchUps store — date helpers', () => {
  beforeEach(() => {
    clearScheduledMatchUps();
    vi.mocked(getScheduledMatchUps).mockReset();
  });

  it('getMatchUpsForDate filters the FLAT array by schedule.scheduledDate', async () => {
    await seed([mk('a', '2026-07-08'), mk('b', '2026-07-09'), mk('c', '2026-07-08')]);
    expect(getMatchUpsForDate('2026-07-08').map((m) => m.matchUpId)).toEqual(['a', 'c']);
    expect(getMatchUpsForDate('2026-07-09').map((m) => m.matchUpId)).toEqual(['b']);
  });

  it('getMatchUpsForDate returns [] for a date with no matchUps', async () => {
    await seed([mk('a', '2026-07-08')]);
    expect(getMatchUpsForDate('2026-07-10')).toEqual([]);
  });

  it('getMatchUpsForDate ignores matchUps that lack a scheduledDate', async () => {
    await seed([mk('a', '2026-07-08'), mk('unscheduled')]);
    expect(getMatchUpsForDate('2026-07-08').map((m) => m.matchUpId)).toEqual(['a']);
  });

  it('getScheduledDates returns distinct dates, ascending, skipping unscheduled', async () => {
    await seed([mk('a', '2026-07-09'), mk('b', '2026-07-08'), mk('c', '2026-07-09'), mk('unscheduled')]);
    expect(getScheduledDates()).toEqual(['2026-07-08', '2026-07-09']);
  });

  it('both helpers are empty before any fetch and after clear', async () => {
    expect(getMatchUpsForDate('2026-07-08')).toEqual([]);
    expect(getScheduledDates()).toEqual([]);

    await seed([mk('a', '2026-07-08')]);
    expect(getScheduledDates()).toEqual(['2026-07-08']);

    clearScheduledMatchUps();
    expect(getMatchUpsForDate('2026-07-08')).toEqual([]);
    expect(getScheduledDates()).toEqual([]);
  });
});
