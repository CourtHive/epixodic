import { scoreGovernor } from 'tods-competition-factory';

const { generateTieMatchUpScore } = scoreGovernor;
import { buildBoltHistoryDocument } from '../../services/messaging/buildBoltHistoryDocument';
import { getKnownVersion, pushBoltHistoryWithRetry, setKnownVersion } from '../../services/messaging/boltHistoryApi';
import type { BoltHistoryDocument } from '../../services/messaging/boltHistoryDocument';
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

/**
 * Substitute a player on a tieMatchUp side after the engine accepted the
 * substitution. Looks up the incoming participant from the parent team
 * matchUp's roster and replaces the outgoing player in place — this works
 * for singles (single-participant side) and doubles (PAIR side with an
 * individualParticipants array) without disturbing the other player.
 */
export function setTieMatchUpActiveParticipant(
  tieMatchUpId: string,
  sideNumber: 1 | 2,
  outParticipantId: string,
  inParticipantId: string,
) {
  if (!teamMatchUp?.tieMatchUps) return;
  const tieMatchUp = teamMatchUp.tieMatchUps.find((m) => m.matchUpId === tieMatchUpId);
  if (!tieMatchUp?.sides) return;
  const side = tieMatchUp.sides.find((s: any) => s.sideNumber === sideNumber) as any;
  if (!side) return;

  // Look up the full participant object from the parent team matchUp roster
  const teamSide = teamMatchUp.sides?.find((s: any) => s.sideNumber === sideNumber);
  const rosterParticipant = (teamSide as any)?.participant?.individualParticipants?.find(
    (p: any) => p.participantId === inParticipantId,
  );
  const replacement = rosterParticipant ?? { participantId: inParticipantId };

  // Doubles: update the matching slot inside individualParticipants only
  const individuals: any[] | undefined = side.participant?.individualParticipants;
  if (Array.isArray(individuals) && individuals.length) {
    const idx = individuals.findIndex((p) => p?.participantId === outParticipantId);
    if (idx !== -1) {
      individuals[idx] = replacement;
      recalculateTeamScore();
      return;
    }
  }

  // Singles: replace the side participant outright
  side.participant = replacement;
  recalculateTeamScore();
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

interface TieMatchUpPatch {
  score?: any;
  history?: any;
  matchUpStatus?: string;
  winningSide?: number;
  boltStarted?: boolean;
  boltExpired?: boolean;
  boltComplete?: boolean;
  timeoutsUsed?: { 1: number; 2: number };
  side1ServerIndex?: 0 | 1;
  side2ServerIndex?: 0 | 1;
  engineState?: any;
  boltClockRemainingMs?: number;
  serveClockRemainingMs?: number;
  playerTimeSnapshots?: Record<string, { elapsedMs: number; isOnCourt: boolean }>;
  pausedOnExit?: boolean;
}

// Internal helper: apply a patch to a tieMatchUp and recalculate team score.
// Does NOT push to the server. Used by both persistTieMatchUpState (which
// then triggers a push) and applyServerDocument (which must NOT push,
// otherwise hydration causes an immediate echo back to the server).
function applyTieMatchUpPatch(tieMatchUpId: string, patch: TieMatchUpPatch): boolean {
  if (!teamMatchUp?.tieMatchUps) return false;
  const tieMatchUp = teamMatchUp.tieMatchUps.find((m) => m.matchUpId === tieMatchUpId);
  if (!tieMatchUp) return false;

  if (patch.score !== undefined) tieMatchUp.score = patch.score;
  if (patch.history !== undefined) (tieMatchUp as any).history = patch.history;
  if (patch.matchUpStatus !== undefined) tieMatchUp.matchUpStatus = patch.matchUpStatus;
  if (patch.winningSide !== undefined) tieMatchUp.winningSide = patch.winningSide;
  if (patch.boltStarted !== undefined) (tieMatchUp as any).boltStarted = patch.boltStarted;
  if (patch.boltExpired !== undefined) (tieMatchUp as any).boltExpired = patch.boltExpired;
  if (patch.boltComplete !== undefined) (tieMatchUp as any).boltComplete = patch.boltComplete;
  if (patch.timeoutsUsed !== undefined) (tieMatchUp as any).timeoutsUsed = patch.timeoutsUsed;
  if (patch.side1ServerIndex !== undefined) (tieMatchUp as any).side1ServerIndex = patch.side1ServerIndex;
  if (patch.side2ServerIndex !== undefined) (tieMatchUp as any).side2ServerIndex = patch.side2ServerIndex;
  if (patch.engineState !== undefined) (tieMatchUp as any).engineState = patch.engineState;
  if (patch.boltClockRemainingMs !== undefined) (tieMatchUp as any).boltClockRemainingMs = patch.boltClockRemainingMs;
  if (patch.serveClockRemainingMs !== undefined) (tieMatchUp as any).serveClockRemainingMs = patch.serveClockRemainingMs;
  if (patch.playerTimeSnapshots !== undefined) (tieMatchUp as any).playerTimeSnapshots = patch.playerTimeSnapshots;
  if (patch.pausedOnExit !== undefined) (tieMatchUp as any).pausedOnExit = patch.pausedOnExit;

  recalculateTeamScore();
  return true;
}

/**
 * Persist a tieMatchUp's full bolt scoring state directly on the team matchUp.
 * This is the single source of truth for bolt history (points, sets, flags).
 *
 * Triggers a fire-and-forget push to the server. Errors are captured by
 * boltHistoryApi (offline queue) so the local write path never blocks
 * on the network. On VERSION_CONFLICT the push goes through
 * pushBoltHistoryWithRetry which can surface SERVER_NEWER — when that
 * happens, the server's document is applied locally via
 * applyServerDocument so the UI converges automatically.
 */
export function persistTieMatchUpState(tieMatchUpId: string, patch: TieMatchUpPatch) {
  if (!applyTieMatchUpPatch(tieMatchUpId, patch)) return;
  void pushBoltHistoryForTie(tieMatchUpId);
}

/**
 * Apply a BoltHistoryDocument fetched from the server to the local
 * tieMatchUp WITHOUT triggering a push. Used by hydration on mount and
 * by SERVER_NEWER recovery from pushBoltHistoryWithRetry.
 *
 * After this call, the local store reflects the server's view and the
 * version cache is seeded with the server's version. The next user
 * action will push from that version.
 */
export function applyServerDocument(tieMatchUpId: string, document: BoltHistoryDocument): boolean {
  const patch: TieMatchUpPatch = {
    engineState: document.engineState,
    boltStarted: document.boltStarted,
    boltExpired: document.boltExpired,
    boltComplete: document.boltComplete,
    timeoutsUsed: document.timeoutsUsed,
    pausedOnExit: document.pausedOnExit,
    boltClockRemainingMs: document.boltClockRemainingMs,
    serveClockRemainingMs: document.serveClockRemainingMs,
    playerTimeSnapshots: document.playerTimeSnapshots,
  };
  const applied = applyTieMatchUpPatch(tieMatchUpId, patch);
  if (applied) setKnownVersion(tieMatchUpId, document.version);
  return applied;
}

async function pushBoltHistoryForTie(tieMatchUpId: string): Promise<void> {
  if (!teamMatchUp) return;
  const tieMatchUp = teamMatchUp.tieMatchUps?.find((m) => m.matchUpId === tieMatchUpId);
  if (!tieMatchUp) return;
  try {
    const document = buildBoltHistoryDocument(tieMatchUp, teamMatchUp, {
      version: getKnownVersion(tieMatchUpId),
    });
    const result = await pushBoltHistoryWithRetry(document);
    if (result.error === 'SERVER_NEWER' && result.document) {
      // Server has data we should adopt. Apply it locally without re-pushing
      // (applyServerDocument bypasses the push hook).
      applyServerDocument(tieMatchUpId, result.document);
    }
  } catch (err) {
    console.warn('[teamMatchUp] pushBoltHistory build failed', err);
  }
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

/**
 * DEV helper: clears all persisted team matchUps and tie→parent reverse
 * lookups from browser storage. Useful for resetting test scenarios after
 * data model changes. Call from console: dev.resetTeamMatchUps()
 */
export function resetAllTeamMatchUps(): { teamsRemoved: number; lookupsRemoved: number } {
  let teamsRemoved = 0;
  let lookupsRemoved = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
      teamsRemoved++;
    } else if (key.startsWith(TIE_PARENT_PREFIX)) {
      localStorage.removeItem(key);
      lookupsRemoved++;
    }
  }
  teamMatchUp = null;
  activeTieMatchUpId = null;
  scoreVersion = 0;
  return { teamsRemoved, lookupsRemoved };
}

