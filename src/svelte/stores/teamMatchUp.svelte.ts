import { scoreGovernor } from 'tods-competition-factory';

const { generateTieMatchUpScore } = scoreGovernor;
import { browserStorage } from '../../state/browserStorage';
import type { HydratedMatchUp } from '../types';

const STORAGE_KEY_PREFIX = 'team-';
const TIE_PARENT_PREFIX = 'tie-parent-';

let teamMatchUp = $state<HydratedMatchUp | null>(null);
let activeTieMatchUpId = $state<string | null>(null);
let scoreVersion = $state(0);

export function getTeamMatchUpState() {
  return {
    get teamMatchUp() {
      return teamMatchUp;
    },
    get activeTieMatchUpId() {
      return activeTieMatchUpId;
    },
    get scoreVersion() {
      return scoreVersion;
    },
  };
}

export function setTeamMatchUp(matchUp: HydratedMatchUp) {
  teamMatchUp = matchUp;
  activeTieMatchUpId = null;
  persistTeamMatchUp(matchUp);
}

function persistTeamMatchUp(matchUp: HydratedMatchUp) {
  browserStorage.set(STORAGE_KEY_PREFIX + matchUp.matchUpId, JSON.stringify(matchUp));
  // Write reverse lookups so any tieMatchUp can find its parent on refresh
  for (const tm of matchUp.tieMatchUps ?? []) {
    if (tm.matchUpId) {
      browserStorage.set(TIE_PARENT_PREFIX + tm.matchUpId, matchUp.matchUpId);
    }
  }
}

/**
 * Find the parent team matchUp id for a given tieMatchUp id.
 * Used for refresh recovery when only the tieMatchUp id is in the URL.
 */
export function findParentMatchUpId(tieMatchUpId: string): string | undefined {
  return browserStorage.get(TIE_PARENT_PREFIX + tieMatchUpId) ?? undefined;
}

export function setActiveTieMatchUp(tieMatchUpId: string) {
  activeTieMatchUpId = tieMatchUpId;
}

export function clearActiveTieMatchUp() {
  activeTieMatchUpId = null;
}

export function updateTieMatchUpResult(
  tieMatchUpId: string,
  score: any,
  winningSide?: number,
  matchUpStatus?: string,
) {
  if (!teamMatchUp?.tieMatchUps) return;

  const tieMatchUp = teamMatchUp.tieMatchUps.find((m) => m.matchUpId === tieMatchUpId);
  if (!tieMatchUp) return;

  tieMatchUp.score = score;
  tieMatchUp.winningSide = winningSide;
  if (matchUpStatus) tieMatchUp.matchUpStatus = matchUpStatus;

  recalculateTeamScore();
}

/**
 * Get a tieMatchUp by id from the current team matchUp.
 */
export function getTieMatchUp(tieMatchUpId: string): HydratedMatchUp | undefined {
  return teamMatchUp?.tieMatchUps?.find((m) => m.matchUpId === tieMatchUpId);
}

/**
 * Persist a tieMatchUp's full bolt scoring state directly on the team matchUp.
 * This is the single source of truth for bolt history (points, sets, flags).
 */
export function persistTieMatchUpState(
  tieMatchUpId: string,
  patch: {
    score?: any;
    history?: any;
    matchUpStatus?: string;
    winningSide?: number;
    boltStarted?: boolean;
    boltExpired?: boolean;
    boltComplete?: boolean;
    timeoutsUsed?: { 1: number; 2: number };
    engineState?: any;
    boltClockRemainingMs?: number;
    serveClockRemainingMs?: number;
    playerTimeSnapshots?: Record<string, { elapsedMs: number; isOnCourt: boolean }>;
    pausedOnExit?: boolean;
  },
) {
  if (!teamMatchUp?.tieMatchUps) return;
  const tieMatchUp = teamMatchUp.tieMatchUps.find((m) => m.matchUpId === tieMatchUpId);
  if (!tieMatchUp) return;

  if (patch.score !== undefined) tieMatchUp.score = patch.score;
  if (patch.history !== undefined) (tieMatchUp as any).history = patch.history;
  if (patch.matchUpStatus !== undefined) tieMatchUp.matchUpStatus = patch.matchUpStatus;
  if (patch.winningSide !== undefined) tieMatchUp.winningSide = patch.winningSide;
  if (patch.boltStarted !== undefined) (tieMatchUp as any).boltStarted = patch.boltStarted;
  if (patch.boltExpired !== undefined) (tieMatchUp as any).boltExpired = patch.boltExpired;
  if (patch.boltComplete !== undefined) (tieMatchUp as any).boltComplete = patch.boltComplete;
  if (patch.timeoutsUsed !== undefined) (tieMatchUp as any).timeoutsUsed = patch.timeoutsUsed;
  if (patch.engineState !== undefined) (tieMatchUp as any).engineState = patch.engineState;
  if (patch.boltClockRemainingMs !== undefined) (tieMatchUp as any).boltClockRemainingMs = patch.boltClockRemainingMs;
  if (patch.serveClockRemainingMs !== undefined) (tieMatchUp as any).serveClockRemainingMs = patch.serveClockRemainingMs;
  if (patch.playerTimeSnapshots !== undefined) (tieMatchUp as any).playerTimeSnapshots = patch.playerTimeSnapshots;
  if (patch.pausedOnExit !== undefined) (tieMatchUp as any).pausedOnExit = patch.pausedOnExit;

  recalculateTeamScore();
}

export function recalculateTeamScore() {
  if (!teamMatchUp) return;

  if (isIntennseMatchUp(teamMatchUp)) {
    recalculateIntennseScore(teamMatchUp);
  } else {
    recalculateStandardScore(teamMatchUp);
  }

  scoreVersion++;
  persistTeamMatchUp(teamMatchUp);
}

function recalculateIntennseScore(matchUp: HydratedMatchUp) {
  const tieMatchUps = matchUp.tieMatchUps ?? [];
  const { side1, side2 } = sumBoltPoints(tieMatchUps);
  const allComplete = tieMatchUps.length > 0 && tieMatchUps.every((m) => m.matchUpStatus === 'COMPLETED');
  const winningSide = allComplete && side1 !== side2 ? (side1 > side2 ? 1 : 2) : undefined;

  matchUp.score = {
    ...matchUp.score,
    scoreStringSide1: `${side1}-${side2}`,
    scoreStringSide2: `${side2}-${side1}`,
    sets: [{ side1Score: side1, side2Score: side2, winningSide }],
  };
  if (winningSide) matchUp.winningSide = winningSide;
}

function sumBoltPoints(tieMatchUps: HydratedMatchUp[]): { side1: number; side2: number } {
  let side1 = 0;
  let side2 = 0;
  for (const bolt of tieMatchUps) {
    for (const set of bolt.score?.sets ?? []) {
      side1 += set.side1Score ?? 0;
      side2 += set.side2Score ?? 0;
    }
  }
  return { side1, side2 };
}

function recalculateStandardScore(matchUp: HydratedMatchUp) {
  const result = generateTieMatchUpScore({ matchUp: matchUp as any });
  if (result.set) {
    matchUp.score = {
      ...matchUp.score,
      scoreStringSide1: result.scoreStringSide1,
      scoreStringSide2: result.scoreStringSide2,
      sets: [result.set],
    };
  }
  if (result.winningSide) matchUp.winningSide = result.winningSide;
}

function isIntennseMatchUp(matchUp: any): boolean {
  if (matchUp?.competitionFormat?.sport === 'INTENNSE') return true;
  const format = matchUp?.matchUpFormat || '';
  return format.includes('XA-S:T');
}

export function restoreTeamMatchUp(matchUpId: string): boolean {
  const stored = browserStorage.get(STORAGE_KEY_PREFIX + matchUpId);
  if (stored) {
    try {
      teamMatchUp = JSON.parse(stored);
      activeTieMatchUpId = null;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function clearTeamMatchUp() {
  if (teamMatchUp) {
    browserStorage.remove(STORAGE_KEY_PREFIX + teamMatchUp.matchUpId);
  }
  teamMatchUp = null;
  activeTieMatchUpId = null;
  scoreVersion = 0;
}

