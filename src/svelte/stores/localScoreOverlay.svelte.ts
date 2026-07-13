import { browserStorage } from '../../state/browserStorage';
import type { HydratedMatchUp } from '../types';

/**
 * Bridges locally-scored matchUps (written to localStorage by the scoring flow,
 * including inside the desktop scoring iframe) onto the server-sourced
 * tournament views, and exposes a reactive signal so those views update live
 * without a page reload.
 *
 * Why a `storage` listener: the desktop scorer runs in a same-origin iframe
 * (`scoringModal.ts`), so its in-frame `matcharchive:updated` dispatches and
 * Svelte store reactivity never reach the parent window. A `storage` event,
 * however, DOES fire on the parent whenever the iframe (or another tab) writes
 * localStorage — that is the cross-frame signal we key on, alongside the
 * same-window `matcharchive:updated` (local saves + scoring-modal close).
 */

let version = $state(0);

function bump(): void {
  version += 1;
}

if (typeof window !== 'undefined') {
  // Cross-frame / cross-tab: fires on the parent when the scoring iframe writes.
  window.addEventListener('storage', bump);
  // Same-window: local saves and the scoring-modal onClose refresh.
  window.addEventListener('matcharchive:updated', bump);
}

/** Reactive counter — read inside a `$derived` to re-run on local-score changes. */
export function localScoreVersion(): number {
  return version;
}

interface LocalScorePatch {
  score?: any;
  matchUpStatus?: string;
  winningSide?: 1 | 2;
}

/** Read a locally-scored snapshot for a matchUpId, if it carries real progress. */
export function readLocalScore(matchUpId: string): LocalScorePatch | undefined {
  const raw = browserStorage.get(matchUpId);
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw);
    if (!data) return undefined;
    const hasProgress =
      !!data.winningSide ||
      (!!data.matchUpStatus && data.matchUpStatus !== 'TO_BE_PLAYED') ||
      (Array.isArray(data.score?.sets) && data.score.sets.length > 0);
    if (!hasProgress) return undefined;
    return { score: data.score, matchUpStatus: data.matchUpStatus, winningSide: data.winningSide };
  } catch {
    return undefined;
  }
}

/**
 * Merge any locally-scored progress on top of a server matchUp. Local wins only
 * while the server side is not yet decided — a submitted (server-final) outcome
 * is never regressed by local state. `hasLocalScore` flags that the displayed
 * score is local and not yet submitted to CFS.
 */
export function overlayLocalScore<T extends HydratedMatchUp>(matchUp: T): T {
  if (matchUp.winningSide || matchUp.matchUpStatus === 'COMPLETED') return matchUp;
  const local = readLocalScore(matchUp.matchUpId);
  if (!local) return matchUp;
  // A locally-scored match is no longer merely "ready to score" — clearing the
  // flag lets it move cleanly from the ready section into in-progress/completed.
  return { ...matchUp, ...local, readyToScore: false, hasLocalScore: true } as T;
}
