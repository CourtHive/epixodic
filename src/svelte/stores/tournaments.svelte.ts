import { getTournamentInfo } from '../services/factoryApi';
import { browserStorage } from '../../state/browserStorage';
import type { TournamentInfo } from '../types';

const STORAGE_KEY = 'saved_tournament_ids';

let list = $state<TournamentInfo[]>([]);
let loading = $state(false);
let error = $state<string | undefined>(undefined);

export function getTournamentsState() {
  return {
    get list() {
      return list;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}

export async function fetchTournamentInfo(tournamentId: string): Promise<TournamentInfo | undefined> {
  // Check if already loaded
  const existing = list.find((t) => t.tournamentId === tournamentId);
  if (existing) return existing;

  loading = true;
  error = undefined;

  const result = await getTournamentInfo(tournamentId);

  if (result.error) {
    error = result.error;
    loading = false;
    return undefined;
  }

  if (result.data) {
    // Ensure tournamentId is set (server may nest it differently)
    const info: TournamentInfo = { ...result.data, tournamentId: result.data.tournamentId || tournamentId };
    console.log('[tournaments] adding tournament:', info.tournamentId, info);
    list = [...list, info];
    saveTournamentIds();
    loading = false;
    return info;
  }

  loading = false;
  return undefined;
}

export async function refreshTournamentInfo(tournamentId: string): Promise<TournamentInfo | undefined> {
  loading = true;
  error = undefined;

  const result = await getTournamentInfo(tournamentId);

  if (result.error) {
    error = result.error;
    loading = false;
    return undefined;
  }

  if (result.data) {
    const info: TournamentInfo = { ...result.data, tournamentId: result.data.tournamentId || tournamentId };
    list = list.map((t) => (t.tournamentId === tournamentId ? info : t));
    loading = false;
    return info;
  }

  loading = false;
  return undefined;
}

export function clearTournaments() {
  list = [];
  error = undefined;
  browserStorage.remove(STORAGE_KEY);
}

export function removeTournament(tournamentId: string) {
  list = list.filter((t) => t.tournamentId !== tournamentId);
  saveTournamentIds();
}

function saveTournamentIds() {
  const ids = list.map((t) => t.tournamentId);
  browserStorage.set(STORAGE_KEY, JSON.stringify(ids));
}

export function getSavedTournamentIds(): string[] {
  try {
    return JSON.parse(browserStorage.get(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export async function loadSavedTournaments() {
  const ids = getSavedTournamentIds();
  for (const id of ids) {
    await fetchTournamentInfo(id);
  }
}
