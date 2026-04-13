import { browserStorage } from '../../state/browserStorage';

const STORAGE_KEY = 'scoring_prefs';

interface ScoringPrefs {
  showForcedError: boolean | null; // null = use layout default (landscape: true, portrait: false)
  sidesSwapped: boolean; // true = visually swap left/right sides to match court orientation
}

const defaults: ScoringPrefs = {
  showForcedError: null,
  sidesSwapped: false,
};

function load(): ScoringPrefs {
  const raw = browserStorage.get(STORAGE_KEY);
  if (!raw) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

let prefs = $state<ScoringPrefs>(load());

function persist() {
  browserStorage.set(STORAGE_KEY, JSON.stringify(prefs));
}

export function getScoringPrefs(): ScoringPrefs {
  return prefs;
}

export function setShowForcedError(value: boolean | null) {
  prefs.showForcedError = value;
  persist();
}

export function setSidesSwapped(value: boolean) {
  prefs.sidesSwapped = value;
  persist();
}

export function toggleSidesSwapped() {
  prefs.sidesSwapped = !prefs.sidesSwapped;
  persist();
}
