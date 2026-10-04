import { getScheduledMatchUps, type ScheduledMatchUpsResponse } from '../services/factoryApi';
import type { HydratedMatchUp } from '../types';

let data = $state<ScheduledMatchUpsResponse | undefined>(undefined);
let loading = $state(false);
let error = $state<string | undefined>(undefined);

export function getScheduledMatchUpsState() {
  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get dateMatchUps() {
      return data?.dateMatchUps;
    },
    get completedMatchUps() {
      return data?.completedMatchUps;
    },
  };
}

export async function fetchScheduledMatchUps(
  tournamentId: string,
  options?: Record<string, any>,
): Promise<ScheduledMatchUpsResponse | undefined> {
  loading = true;
  error = undefined;

  const result = await getScheduledMatchUps(tournamentId, options);

  if (result.error) {
    error = result.error;
    loading = false;
    return undefined;
  }

  if (result.data) {
    data = result.data;
    loading = false;
    return result.data;
  }

  loading = false;
  return undefined;
}

export function clearScheduledMatchUps() {
  data = undefined;
  error = undefined;
}

// `dateMatchUps` is a FLAT array of matchUps (the factory shape), not a map keyed
// by date — so filter by each matchUp's scheduled date rather than indexing.
export function getMatchUpsForDate(date: string): HydratedMatchUp[] {
  return (data?.dateMatchUps ?? []).filter((matchUp) => matchUp.schedule?.scheduledDate === date);
}

// Distinct scheduled dates present in the current data, ascending — for driving a
// date filter/selector in the matchUps view.
export function getScheduledDates(): string[] {
  const dates = new Set<string>();
  for (const matchUp of data?.dateMatchUps ?? []) {
    const scheduledDate = matchUp.schedule?.scheduledDate;
    if (scheduledDate) dates.add(scheduledDate);
  }
  return [...dates].sort();
}
