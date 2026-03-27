import { resetMatch } from '../../match/displayMatchArchive';
import { browserStorage } from '../../state/browserStorage';
import type { HydratedMatchUp } from '../types';

let matchUps = $state<HydratedMatchUp[]>([]);

const myMatchUps = $derived(matchUps.filter((m) => !m.tournamentId));
const tournamentMatchUps = $derived(matchUps.filter((m) => !!m.tournamentId));

export function getLocalMatchUpsState() {
  return {
    get matchUps() {
      return matchUps;
    },
    get myMatchUps() {
      return myMatchUps;
    },
    get tournamentMatchUps() {
      return tournamentMatchUps;
    },
  };
}

export function refreshLocalMatchUps() {
  const archive: string[] = JSON.parse(browserStorage.get('match_archive') || '[]')
    .filter((item: any, i: number, s: any) => s.lastIndexOf(item) === i)
    .reverse();

  const loaded: HydratedMatchUp[] = [];
  for (const matchId of archive) {
    const raw = browserStorage.get(matchId);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (data) loaded.push(data as HydratedMatchUp);
    } catch {
      // skip corrupt entries
    }
  }
  matchUps = loaded;
}

export function completeLocalMatchUp(matchUpId: string, winningSide: 1 | 2, matchUpStatus: 'RETIRED' | 'WALKOVER') {
  const raw = browserStorage.get(matchUpId);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    data.winningSide = winningSide;
    data.matchUpStatus = matchUpStatus;
    // Remove in-progress point scores from last set since match is now ended
    const sets = data.score?.sets;
    if (sets?.length) {
      const lastSet = sets[sets.length - 1];
      delete lastSet.side1PointScore;
      delete lastSet.side2PointScore;
    }
    browserStorage.set(matchUpId, JSON.stringify(data));
    refreshLocalMatchUps();
  } catch {
    // skip corrupt entries
  }
}

export function deleteLocalMatchUp(matchUpId: string) {
  browserStorage.remove(matchUpId);
  const currentMatchId = browserStorage.get('current_match');
  let archive = JSON.parse(browserStorage.get('match_archive') || '[]');
  archive = archive.filter((id: string) => id !== matchUpId);
  browserStorage.set('match_archive', JSON.stringify(archive));

  if (matchUpId === currentMatchId) {
    resetMatch();
  }

  refreshLocalMatchUps();
}

// Auto-refresh when vanilla JS scoring saves a match
if (typeof window !== 'undefined') {
  window.addEventListener('matcharchive:updated', () => refreshLocalMatchUps());
}
