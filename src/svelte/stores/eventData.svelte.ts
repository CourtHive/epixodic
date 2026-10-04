import { getEventData } from '../services/factoryApi';
import { localScoreVersion, overlayLocalScore } from './localScoreOverlay.svelte';
import type { HydratedMatchUp, Participant } from '../types';

let tournamentId = $state<string | undefined>(undefined);
let eventId = $state<string | undefined>(undefined);
let matchUps = $state<HydratedMatchUp[]>([]);
let participants = $state<Participant[]>([]);
let loading = $state(false);
let error = $state<string | undefined>(undefined);

// Server matchUps with any in-progress local scores merged on top. Reactive to
// local scoring (incl. the scoring iframe) via localScoreVersion(), so the Draw
// view reflects points as they are scored without a CFS round-trip or reload.
const overlaidMatchUps = $derived.by(() => {
  localScoreVersion();
  return matchUps.map((m) => overlayLocalScore(m));
});

const completedMatchUps = $derived(
  overlaidMatchUps.filter((m) => m.winningSide || m.matchUpStatus === 'COMPLETED'),
);
const readyToScoreMatchUps = $derived(
  overlaidMatchUps.filter(
    (m) => m.readyToScore && !m.winningSide && m.matchUpStatus !== 'COMPLETED',
  ),
);
const inProgressMatchUps = $derived(
  overlaidMatchUps.filter(
    (m) =>
      !m.readyToScore &&
      !m.winningSide &&
      m.matchUpStatus !== 'COMPLETED' &&
      m.matchUpStatus === 'IN_PROGRESS',
  ),
);

export function getEventDataState() {
  return {
    get tournamentId() {
      return tournamentId;
    },
    get eventId() {
      return eventId;
    },
    get matchUps() {
      return overlaidMatchUps;
    },
    get participants() {
      return participants;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get completedMatchUps() {
      return completedMatchUps;
    },
    get readyToScoreMatchUps() {
      return readyToScoreMatchUps;
    },
    get inProgressMatchUps() {
      return inProgressMatchUps;
    },
  };
}

function extractMatchUps(data: any): HydratedMatchUp[] {
  const eventData = data.eventData || data;
  const allMatchUps: HydratedMatchUp[] = [];

  for (const draw of eventData.drawsData || []) {
    for (const structure of draw.structures || []) {
      for (const roundMatchUps of Object.values(structure.roundMatchUps || {})) {
        allMatchUps.push(...(roundMatchUps as HydratedMatchUp[]));
      }
    }
  }
  return allMatchUps;
}

export async function fetchEventMatchUps(tid: string, eid: string) {
  tournamentId = tid;
  eventId = eid;
  loading = true;
  error = undefined;

  const result = await getEventData(tid, eid);

  if (result.error) {
    error = result.error;
    loading = false;
    return;
  }

  if (result.data) {
    matchUps = extractMatchUps(result.data);
    participants = result.data.participants || [];
    console.log('[eventData] loaded', matchUps.length, 'matchUps,', participants.length, 'participants');
  }

  loading = false;
}

export function clearEventData() {
  tournamentId = undefined;
  eventId = undefined;
  matchUps = [];
  participants = [];
  error = undefined;
}
