<script lang="ts">
  import HorizontalBolt from './HorizontalBolt.svelte';
  import VerticalBolt from './VerticalBolt.svelte';
  import SubstitutionModal from './SubstitutionModal.svelte';
  import PlayerSelectModal from './PlayerSelectModal.svelte';
  import CoinTossModal from './CoinTossModal.svelte';
  import PenaltyModal from './PenaltyModal.svelte';
  import PenaltyBoxDetailModal from './PenaltyBoxDetailModal.svelte';
  import PlayerTimeWarning from './PlayerTimeWarning.svelte';
  import PointDetailModal from './PointDetailModal.svelte';
  import {
    buildEditWinnerPayload,
    buildWinnerEditDecorations,
    type PointHistoryEntry,
  } from './historyStream';
  import {
    getScoringState,
    getEngineState,
    setEngineState,
    initScoringEngine,
    addPoint,
    undo,
    redo,
    setServer,
    setLineUp,
    substitute as engineSubstitute,
    endSegment,
    getPenaltyBoxProfile,
    decoratePoint,
    editPoint,
    removePoint,
    pinEntryServersToPoints,
    recordChallengeEntry,
    removeChallengeEntry,
  } from '../../stores/scoringEngine.svelte';
  import {
    getPlayerTimeState,
    registerPlayers,
    startTracking,
    setOnCourt,
    pauseAllOnCourtClocks,
    resumeAllOnCourtClocks,
    getPlayerTimeSnapshots,
    restorePlayerTimeSnapshots,
    checkTimeLimit,
    getBenchPlayers,
    stopTracking,
    resetPlayerTimes,
  } from '../../stores/playerTime.svelte';
  import {
    sendToBox,
    isInBox,
    pauseAllPenaltyClocks,
    resumePenaltyClocksForBolt,
    hydrateFromTeamMatchUp,
    setPersistCallback,
    type BoltContext,
    type BoltGender,
    type PenaltyPoint,
  } from '../../stores/penaltyBox.svelte';
  import { buildIntennseSnapshot } from '../../../services/intennseStats';
  import { sendScore, sendIntennseUpdate, sendClockSync } from '../../../services/messaging/scoreRelay';
  import { getClockSnapshot, createClock, destroyClock, restartClock, pauseClock, resumeClock, setClockRemaining } from '../../../clock';
  import {
    getTieMatchUp,
    getTeamMatchUpState,
    persistTieMatchUpState,
    applyServerDocument,
    restoreTeamMatchUp,
    findParentMatchUpId,
    setTeamMatchUp,
    setTieMatchUpActiveParticipant,
    setActiveTieMatchUp,
    getNextTieMatchUpId,
    getCompletedBoltCount,
  } from '../../stores/teamMatchUp.svelte';
  import { fetchParentMatchUp, hydrateBoltHistoryOnMount } from '../../../services/messaging/matchUpHistoryApi';
  import { getLoginState } from '../../../services/auth/loginState';
  import { getAuthState } from '../../stores/auth.svelte';
  import { submitOfficialScore } from '../../../services/messaging/scoreSubmitApi';
  import { buildScoreOutcome } from '../../../intennse/buildScoreOutcome';
  import LoginModal from '../shared/LoginModal.svelte';
  import { fixtures } from 'tods-competition-factory';
  import { onMount, onDestroy } from 'svelte';

  const INTENNSE_STANDARD = fixtures.competitionFormats.INTENNSE_STANDARD;

  // Business logic — independently testable
  import { resolvePointAttribution, type Side } from '../../../intennse/pointRules';
  import {
    onBoltStart, onRallyStart, onPointComplete, onTimeoutStart, onTimeoutEnd,
    BOLT_DURATION_MS, SERVE_CLOCK_DURATION_MS, BOLT_TICK_MS, SERVE_TICK_MS,
    setBoltDuration,
    type ClockCommand,
  } from '../../../intennse/clockOrchestration';
  import { getCurrentBoltScore, getAggregateScore } from '../../../intennse/scoreComputation';
  import { getServingState, getServeSide, updateSideServerIndices, type ServeSide } from '../../../intennse/servingRules';
  import { getScoringPrefs } from '../../stores/scoringPrefs.svelte';

  let { matchUpId = '', boltLabel = '', side1Name: propSide1Name = '', side2Name: propSide2Name = '' }: {
    matchUpId: string;
    boltLabel?: string;
    side1Name?: string;
    side2Name?: string;
  } = $props();

  // svelte-ignore state_referenced_locally — editable local copy
  let side1Name = $state(propSide1Name);
  // svelte-ignore state_referenced_locally
  let side2Name = $state(propSide2Name);

  const scoring = getScoringState();
  const playerTime = getPlayerTimeState();

  let BREAK_DURATION_MS = 2 * 60 * 1000; // 2 minutes between bolts, configurable
  const CATEGORY_BREAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes between categories (§2.5)

  let rallyInProgress = $state(false);
  let rallyCount = $state(0);
  let officialPause = $state(false);
  let boltStarted = $state(false);
  let boltExpired = $state(false);
  let boltComplete = $state(false);
  let breakActive = $state(false);
  let breakPaused = $state(false);
  let serveClockExpired = $state(false);
  let serveClockWasRunning = false;
  let arcBaseScore = $state({ side1: 0, side2: 0 });
  let timeoutTeamName = $state('');
  let timeoutSide = $state<1 | 2 | null>(null);
  /** Per-tieMatchUp timeout count (live state, persisted on exit). */
  let timeoutsUsed = $state<{ 1: number; 2: number }>({ 1: 0, 2: 0 });
  /** Max timeouts per side across the entire ARC (rulebook §2.8: 5). */
  const maxTimeoutsPerArc = (INTENNSE_STANDARD as any).timeoutRules?.maxPerSide ?? 5;
  /** Max timeouts per side within a single tieMatchUp (rulebook §2.8: 2). */
  const maxTimeoutsPerTieMatchUp = (INTENNSE_STANDARD as any).timeoutRules?.maxPerTieMatchUp ?? 2;
  let serveSide = $state<ServeSide>('DEUCE');
  let categoryLabel = $state('');
  /** Side that initiated the current challenge (null = umpire review, no challenge consumed). */
  let challengingSide = $state<1 | 2 | null>(null);
  /** True when the ARC is complete and we're showing the result splash. */
  let showArcResult = $state(false);
  /** True when the final bolt ended in an aggregate tie — one deciding point must be played. */
  let decidingPoint = $state(false);
  const isMobile = matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 768;
  let isLandscape = $state(window.innerWidth > window.innerHeight);
  const scoringPrefs = getScoringPrefs();
  const auth = getAuthState();

  // Score submission state
  let scoreSubmitting = $state(false);
  let lastSubmittedBoltKey = $state('');
  let showLoginModal = $state(false);

  function getCurrentBoltKey(): string {
    return `${matchUpId}-${globalBoltNumber}`;
  }

  /**
   * Resolve the current bolt's (matchUpType, gender) tuple — used by the
   * penalty box to decide whether a penalised player is eligible for this
   * bolt. Gender is read from the tieFormat collection definition when
   * available, with a fallback to whatever the tieMatchUp itself carries.
   */
  function getCurrentBoltContext(): BoltContext {
    const tieMatchUp = getTieMatchUp(matchUpId) as any;
    const parentMatchUp = getTeamMatchUpState().teamMatchUp as any;
    const defs = parentMatchUp?.tieFormat?.collectionDefinitions ?? [];
    const collectionId = tieMatchUp?.collectionId;
    const def = defs.find((d: any) => d.collectionId === collectionId);
    const rawGender = (def?.gender ?? tieMatchUp?.gender ?? '').toUpperCase();
    const gender =
      rawGender === 'MALE' || rawGender === 'FEMALE' || rawGender === 'MIXED'
        ? (rawGender as BoltGender)
        : undefined;
    return { matchUpType: tieMatchUp?.matchUpType, gender };
  }

  /**
   * Write penalty lifecycle metadata (servedMs / releasedAt) onto a
   * PENALTY_INCURRED point that lives in a PRIOR tieMatchUp within the
   * current ARC. The engine is scoped to the currently-loaded tie, so
   * cross-tie updates mutate the persisted `engineState.history.points`
   * entry directly and trigger a push for that tie.
   */
  function decoratePriorTiePenalty(
    tieMatchUpId: string,
    pointIndex: number,
    metadata: Record<string, any>,
  ) {
    const team = getTeamMatchUpState().teamMatchUp as any;
    const tie = team?.tieMatchUps?.find((t: any) => t?.matchUpId === tieMatchUpId);
    const point = tie?.engineState?.history?.points?.[pointIndex];
    if (!point) return;
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== undefined) point[k] = v;
    }
    // Mark the prior tie dirty so the next push sends the updated history.
    tie.updatedAt = new Date().toISOString();
    // Note: we deliberately do NOT call pushBoltHistoryForTie here; the
    // pending-push mechanism in teamMatchUp.svelte.ts fires on the next
    // user-driven state change. If we need to force-push a stale penalty
    // update (e.g. during navigation), that's handled by
    // pauseAndPersistOnExit's existing persist path.
  }

  async function submitCurrentBoltScore(): Promise<boolean> {
    const teamState = getTeamMatchUpState();
    const engineState = getEngineState();
    const dto = buildScoreOutcome({ matchUpId, engineState, teamMatchUp: teamState.teamMatchUp });
    if (!dto) return false;

    scoreSubmitting = true;
    try {
      const result = await submitOfficialScore(dto);
      if (result.success) {
        lastSubmittedBoltKey = getCurrentBoltKey();
        console.log('[score submit] official score submitted', { matchUpId, boltKey: lastSubmittedBoltKey });
        return true;
      } else {
        console.warn('[score submit] failed:', result.error);
        return false;
      }
    } catch (err) {
      console.warn('[score submit] error:', err);
      return false;
    } finally {
      scoreSubmitting = false;
    }
  }

  function handleManualSubmit() {
    if (!auth.isAuthenticated) {
      showLoginModal = true;
      return;
    }
    submitCurrentBoltScore();
  }

  // Active player IDs per side. Singles → length 1, doubles → length 2.
  // For doubles, side[N]ServerIndex points at the partner currently cued up
  // to serve when sideN holds the serve; it rotates between tours via
  // updateSideServerIndices() in servingRules.
  let side1PlayerIds = $state<string[]>([]);
  let side2PlayerIds = $state<string[]>([]);
  let side1ServerIndex = $state<0 | 1>(0);
  let side2ServerIndex = $state<0 | 1>(0);
  let isDoublesMatchUp = $state<boolean>(false);

  /** Active server participant id for the currently serving side. */
  function currentServerParticipantId(): string {
    const serverIds = scoring.server === 0 ? side1PlayerIds : side2PlayerIds;
    const idx = scoring.server === 0 ? side1ServerIndex : side2ServerIndex;
    return serverIds[idx] ?? serverIds[0] ?? '';
  }

  /** Last token of a participantName (used for compact mobile display). */
  function getLastName(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts[parts.length - 1] || name;
  }

  /**
   * Per-side player slot view-model. The bolt layouts and PlayerPanel render
   * straight off this — it carries everything they need (display strings,
   * remaining time, on-court flag, and which player is the active server).
   */
  type PlayerSlot = {
    participantId: string;
    participantName: string;
    lastName: string;
    jerseyNumber?: string;
    courtTimeRemainingMs: number;
    isOnCourt: boolean;
    isServer: boolean;
  };

  function buildSlots(ids: string[], serverIndex: 0 | 1, isServingSide: boolean): PlayerSlot[] {
    return ids.map((id, idx) => {
      const entry = playerTime.players[id];
      const name = entry?.participantName ?? '';
      const remaining = entry
        ? Math.max(0, playerTime.maxCourtTimeMs - entry.clock.getElapsedMs())
        : 0;
      return {
        participantId: id,
        participantName: name,
        lastName: getLastName(name),
        jerseyNumber: entry?.jerseyNumber,
        courtTimeRemainingMs: remaining,
        isOnCourt: entry?.isOnCourt ?? false,
        isServer: isServingSide && idx === serverIndex,
      };
    });
  }

  const side1Players = $derived.by<PlayerSlot[]>(() => {
    void playerTime.version;
    void scoring.version;
    return buildSlots(side1PlayerIds, side1ServerIndex, scoring.server === 0);
  });
  const side2Players = $derived.by<PlayerSlot[]>(() => {
    void playerTime.version;
    void scoring.version;
    return buildSlots(side2PlayerIds, side2ServerIndex, scoring.server === 1);
  });

  let subModalSide = $state<1 | 2 | null>(null);
  let penaltySubPlayer = $state<{ participantId: string; participantName: string } | null>(null);
  let penaltyModalSide = $state<1 | 2 | null>(null);
  let selectModalSide = $state<1 | 2 | null>(null);
  let showCoinToss = $state(false);
  // Check if any tieMatchUp in this team matchUp has been scored — if so, serve was already determined
  const teamHasHistory = $derived.by(() => {
    const tm = getTeamMatchUpState().teamMatchUp as any;
    return tm?.tieMatchUps?.some((t: any) => t.engineState?.score?.sets?.length > 0) ?? false;
  });
  let serverDetermined = $state(false);
  let sideRoster = $state<Record<string, 1 | 2>>({});
  let playerTimePanelOpen = $state(false);
  let playerTimeSide = $state<1 | 2 | null>(null);
  let timeWarning = $state<{ playerName: string; remainingMs: number } | null>(null);
  let autoTimeSubTriggered = $state<Set<string>>(new Set());

  // ── Pre-bolt player selection ──
  // Required active players per side: 1 for singles, 2 for doubles. The user
  // confirms selection (or accepts the pre-assigned roster) before the first
  // BOLT can be started; subsequent player changes go through Substitute.
  const playersPerSide = $derived(isDoublesMatchUp ? 2 : 1);
  const side1SelectionComplete = $derived(side1PlayerIds.length === playersPerSide);
  const side2SelectionComplete = $derived(side2PlayerIds.length === playersPerSide);
  const selectionComplete = $derived(side1SelectionComplete && side2SelectionComplete);

  // ── Derived scores (read engine directly, version triggers reactivity) ──

  const currentBoltScore = $derived.by(() => {
    void scoring.version;
    return getCurrentBoltScore(getEngineState());
  });

  const currentAggregateScore = $derived.by(() => {
    void scoring.version;
    const local = getAggregateScore(getEngineState());
    return {
      side1: arcBaseScore.side1 + local.side1,
      side2: arcBaseScore.side2 + local.side2,
    };
  });

  /** Challenges used in the current tieMatchUp, derived from history entries. */
  const localChallengesUsed = $derived.by(() => {
    void scoring.version;
    const entries = getEngineState()?.history?.entries ?? [];
    const result = { 1: 0, 2: 0 };
    for (const e of entries) {
      if (e?.type === 'challenge') {
        const s = e.data?.sideNumber as 1 | 2;
        if (s) result[s]++;
      }
    }
    return result;
  });

  const matchComplete = $derived.by(() => {
    void scoring.version;
    return scoring.isComplete;
  });

  const currentBoltNumber = $derived.by(() => {
    void scoring.version;
    const sets = getEngineState()?.score?.sets ?? [];
    return sets.length + 1;
  });

  const globalBoltNumber = $derived.by(() => {
    void scoring.version;
    const priorBolts = getCompletedBoltCount(matchUpId);
    const localSets = getEngineState()?.score?.sets ?? [];
    return priorBolts + localSets.length + 1;
  });

  /** Reactive stream of history.points for the current tieMatchUp,
   *  fed into the PointHistoryStream viewer in both layouts. */
  const historyPoints = $derived.by<any[]>(() => {
    void scoring.version;
    return getEngineState()?.history?.points ?? [];
  });

  /** Reactive entries array — includes substitutions, endSegment, etc.
   *  Interleaved with points by the PointHistoryStream viewer. */
  const historyEntries = $derived.by<any[]>(() => {
    void scoring.version;
    return getEngineState()?.history?.entries ?? [];
  });

  /** participantId → name lookup for resolving substitution entries
   *  in the history viewer (engine entries only carry IDs). */
  const participantNames = $derived.by<Record<string, string>>(() => {
    void playerTime.version;
    const map: Record<string, string> = {};
    for (const [id, entry] of Object.entries(playerTime.players)) {
      map[id] = entry.participantName;
    }
    return map;
  });

  // ── Clock command executor ──

  function executeClockCommands(commands: ClockCommand[]) {
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'restart': restartClock(cmd.clockId); break;
        case 'pause': pauseClock(cmd.clockId); break;
        case 'resume': resumeClock(cmd.clockId); break;
        case 'destroy': destroyClock(cmd.clockId); break;
        case 'create':
          createClock({
            id: cmd.clockId,
            durationMs: cmd.durationMs,
            direction: 'down',
            tickIntervalMs: cmd.tickIntervalMs,
            autoStart: cmd.autoStart,
            onExpire: cmd.clockId === 'timeoutTimer' ? () => handleDismissTimeout() : undefined,
          });
          break;
      }
    }
  }

  // ── Lifecycle ──

  function handleResize() {
    isLandscape = window.innerWidth > window.innerHeight;
  }

  onMount(async () => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Per-tieMatchUp `playerTime` state is reset: the court-time budget
    // is per-tieMatchUp (§2.8 line 250-253), and a stale `isOnCourt`
    // flag from a prior tieMatchUp would otherwise produce "< 2:00
    // remaining" warnings on players who have never been subbed in here.
    // If there's a persisted snapshot for this matchUpId,
    // `restorePlayerTimeSnapshots` below rehydrates `elapsedMs` after
    // `initTeamRosters` has re-created the player entries.
    //
    // Penalty box is NOT reset here — it's a pure projection of
    // `history.points` across every tieMatchUp in the ARC. We call
    // `hydrateFromTeamMatchUp(...)` once the team matchUp has been
    // loaded (see below) to rebuild the in-memory box from history.
    resetPlayerTimes();

    // Ensure the team matchUp is loaded into the store (handles page refresh)
    let teamState = getTeamMatchUpState();
    if (!teamState.teamMatchUp) {
      const parentId = findParentMatchUpId(matchUpId);
      if (parentId) {
        restoreTeamMatchUp(parentId);
        teamState = getTeamMatchUpState();
      }
    }

    // Fully-fresh-device fallback: no localStorage at all for this
    // tieMatchUp. Ask the server for the parent team matchUp by
    // tieMatchUpId so the store can be populated, then proceed with
    // hydration as usual. This is the cross-device handoff path where
    // the new device has no prior context whatsoever.
    if (!teamState.teamMatchUp) {
      try {
        const parentResult = await fetchParentMatchUp(matchUpId);
        if (parentResult.teamMatchUp) {
          setTeamMatchUp(parentResult.teamMatchUp);
          teamState = getTeamMatchUpState();
          console.log('[bolt mount] fetched parent matchUp from server');
        } else if (parentResult.error && parentResult.error !== 'not_found') {
          console.warn('[bolt mount] fetchParentMatchUp failed:', parentResult.error);
        }
      } catch (err) {
        console.warn('[bolt mount] fetchParentMatchUp error', err);
      }
    }

    setActiveTieMatchUp(matchUpId);

    // Wire the penalty box's servedMs/releasedAt writer. For points in
    // the currently-loaded tieMatchUp we go through the engine's
    // decoratePoint; for points in a prior tieMatchUp within the same
    // ARC we mutate the persisted history directly and push that tie.
    setPersistCallback((tieMatchUpId, pointIndex, metadata) => {
      if (tieMatchUpId === matchUpId) {
        decoratePoint(pointIndex, metadata as Record<string, any>);
      } else {
        decoratePriorTiePenalty(tieMatchUpId, pointIndex, metadata);
      }
    });

    // Hydrate from server BEFORE reading the tieMatchUp into the engine.
    // If the server's stored document is newer than the local cached
    // tieMatchUp (cross-device handoff or stale-device-returns), apply
    // it to the store now so the engine init below sees the right state.
    // Skip server hydration when not authenticated or for local-only matchUps
    if (getLoginState() && teamState.teamMatchUp?.tournamentId) {
      const localTie = getTieMatchUp(matchUpId) as any;
      const localUpdatedAt = localTie?.updatedAt;
      try {
        const hydration = await hydrateBoltHistoryOnMount(matchUpId, localUpdatedAt);
        if (hydration.source === 'server' && hydration.document) {
          applyServerDocument(matchUpId, hydration.document);
          console.log(`[bolt mount] hydrated from server (v${hydration.document.version})`);
        }
      } catch (err) {
        console.warn('[bolt mount] hydration failed, proceeding with local state', err);
      }
    }

    // Primary source of truth: the tieMatchUp inside the team matchUp store
    const tieMatchUp = getTieMatchUp(matchUpId) as any;
    const parentMatchUp = teamState.teamMatchUp as any;

    if (tieMatchUp) {
      const format =
        tieMatchUp.matchUpFormat ||
        parentMatchUp?.matchUpFormat ||
        tieMatchUp.competitionFormat?.matchUpFormat ||
        parentMatchUp?.competitionFormat?.matchUpFormat ||
        'SET7XA-S:T10P';
      const competitionFormat =
        tieMatchUp.competitionFormat || parentMatchUp?.competitionFormat || INTENNSE_STANDARD;
      isDoublesMatchUp = tieMatchUp.matchUpType === 'DOUBLES';

      // Derive category label (e.g. "Men's Singles") from the collection definition
      const collectionId = tieMatchUp.collectionId;
      const defs = parentMatchUp?.tieFormat?.collectionDefinitions ?? [];
      const colDef = defs.find((d: any) => d.collectionId === collectionId);
      categoryLabel = colDef?.collectionName ?? '';

      initScoringEngine({ matchUpFormat: format, competitionFormat, isDoubles: isDoublesMatchUp });

      // Team names from the parent team matchUp's sides
      const s1 = tieMatchUp.sides?.[0];
      const s2 = tieMatchUp.sides?.[1];
      const ts1 = parentMatchUp?.sides?.[0];
      const ts2 = parentMatchUp?.sides?.[1];
      if (ts1?.participant?.participantName) side1Name = ts1.participant.participantName;
      if (ts2?.participant?.participantName) side2Name = ts2.participant.participantName;
      if (s1?.teamParticipant?.participantName) side1Name = s1.teamParticipant.participantName;
      if (s2?.teamParticipant?.participantName) side2Name = s2.teamParticipant.participantName;

      // Restore previous engine state if present
      if (tieMatchUp.engineState) {
        setEngineState(tieMatchUp.engineState);
        const sets = tieMatchUp.engineState?.score?.sets ?? [];
        if (sets.length > 0) {
          boltStarted = true;
          serverDetermined = true;
          const lastSet = sets[sets.length - 1];
          if (lastSet.winningSide !== undefined) {
            boltExpired = true;
            boltComplete = true;
          }
        }
      }

      // Active player IDs — read directly from the tieMatchUp sides.
      // For doubles, the side participant is a PAIR with individualParticipants;
      // for singles it's a single participant.
      side1PlayerIds = extractActiveIds(s1);
      side2PlayerIds = extractActiveIds(s2);

      // Register team rosters for substitution support
      const teamRosters = parentMatchUp?.sides?.map((side: any) => ({
        sideNumber: side.sideNumber,
        participants: side.participant?.individualParticipants?.map((p: any) => {
          const teamAttrs = p.person?.biographicalInformation?.teamAttributes;
          const jerseyNumber = teamAttrs?.length === 1
            ? teamAttrs[0].jerseyNumber
            : teamAttrs?.find((a: any) => a.teamId === side.participant?.participantId)?.jerseyNumber;
          return {
            participantId: p.participantId,
            participantName: p.participantName,
            gender: p.person?.sex || p.person?.gender,
            jerseyNumber,
          };
        }) ?? [],
      })) ?? [];
      initTeamRosters({ teamRosters }, side1PlayerIds, side2PlayerIds);

      // Ensure the engine has lineUps so engine.substitute() works.
      // Doubles: 2 participants per side; singles: 1.
      if (side1PlayerIds.length) setLineUp(1, side1PlayerIds.map((id) => ({ participantId: id })));
      if (side2PlayerIds.length) setLineUp(2, side2PlayerIds.map((id) => ({ participantId: id })));

      // Compute ARC base from other tieMatchUps in the team matchUp
      loadArcBaseScoreFromTeam(parentMatchUp, matchUpId);
      // Recalculate serve side from the current aggregate (§1.4)
      const localAgg = getAggregateScore(getEngineState());
      serveSide = getServeSide({
        side1: arcBaseScore.side1 + localAgg.side1,
        side2: arcBaseScore.side2 + localAgg.side2,
      });
      if (tieMatchUp.timeoutsUsed) timeoutsUsed = tieMatchUp.timeoutsUsed;
      // challengesUsed is derived from history.entries — no separate restore needed
      if (tieMatchUp.side1ServerIndex === 0 || tieMatchUp.side1ServerIndex === 1) {
        side1ServerIndex = tieMatchUp.side1ServerIndex;
      }
      if (tieMatchUp.side2ServerIndex === 0 || tieMatchUp.side2ServerIndex === 1) {
        side2ServerIndex = tieMatchUp.side2ServerIndex;
      }

      console.log('[bolt mount]', {
        matchUpId,
        format,
        source: 'tieMatchUp',
        isDoubles: isDoublesMatchUp,
        side1PlayerIds: $state.snapshot(side1PlayerIds),
        side2PlayerIds: $state.snapshot(side2PlayerIds),
        hasEngineState: !!tieMatchUp.engineState,
        sets: tieMatchUp.engineState?.score?.sets ?? [],
        boltStarted,
        boltExpired,
        boltComplete,
        arcBaseScore,
      });
    } else {
      // Fallback: tieMatchUp not in team store (e.g. direct nav, page refresh before team load)
      console.warn('[bolt mount] no tieMatchUp in team store for', matchUpId);
      initScoringEngine({ matchUpFormat: 'SET7XA-S:T10P', competitionFormat: INTENNSE_STANDARD });
    }

    // Project the penalty box from every tieMatchUp's `history.points`
    // in the ARC. Any PENALTY_INCURRED point without a `penaltyReleasedAt`
    // becomes an open box entry with remaining time derived from
    // `penaltyDurationMs − penaltyServedMs`.
    hydrateFromTeamMatchUp(teamState.teamMatchUp);

    // Configure bolt duration from tieFormat, URL param (?boltMinutes=3), or default
    const searchParams = new URLSearchParams(globalThis.location?.search || '');
    const tieFormatBoltMinutes = (teamState.teamMatchUp as any)?.tieFormat?.boltDurationMinutes;
    const urlBoltMinutes = searchParams.get('boltMinutes');
    const tieFormatBreakSeconds = (teamState.teamMatchUp as any)?.tieFormat?.breakDurationSeconds;
    const urlBreakSeconds = searchParams.get('breakSeconds');
    if (urlBreakSeconds) {
      const ms = Number.parseFloat(urlBreakSeconds) * 1000;
      if (ms > 0) BREAK_DURATION_MS = ms;
    } else if (tieFormatBreakSeconds) {
      const ms = Number(tieFormatBreakSeconds) * 1000;
      if (ms > 0) BREAK_DURATION_MS = ms;
    }
    if (urlBoltMinutes) {
      const ms = Number.parseFloat(urlBoltMinutes) * 60 * 1000;
      if (ms > 0) { setBoltDuration(ms); BREAK_DURATION_MS = Math.min(BREAK_DURATION_MS, ms); }
    } else if (tieFormatBoltMinutes) {
      setBoltDuration(tieFormatBoltMinutes * 60 * 1000);
    }

    createClock({
      id: 'boltTimer',
      durationMs: BOLT_DURATION_MS,
      direction: 'down',
      tickIntervalMs: BOLT_TICK_MS,
      onExpire: handleBoltExpired,
      onResume: () => resumeAllOnCourtClocks(),
      onPause: () => pauseAllOnCourtClocks(),
    });
    createClock({
      id: 'serveClock',
      durationMs: SERVE_CLOCK_DURATION_MS,
      direction: 'down',
      tickIntervalMs: SERVE_TICK_MS,
      onExpire: handleServeClockExpired,
    });

    // Restore clock state from the persisted tieMatchUp (if any)
    const restored = getTieMatchUp(matchUpId) as any;
    if (restored) {
      const boltRemaining = restored.boltClockRemainingMs;
      const serveRemaining = restored.serveClockRemainingMs;
      if (typeof boltRemaining === 'number' && boltRemaining < BOLT_DURATION_MS) {
        // Transition idle → running → paused so resume() will work later
        restartClock('boltTimer');
        pauseClock('boltTimer');
        setClockRemaining('boltTimer', boltRemaining);
      }
      if (typeof serveRemaining === 'number' && serveRemaining < SERVE_CLOCK_DURATION_MS) {
        restartClock('serveClock');
        pauseClock('serveClock');
        setClockRemaining('serveClock', serveRemaining);
      }
      if (restored.playerTimeSnapshots) {
        restorePlayerTimeSnapshots(restored.playerTimeSnapshots);
      }
      // If bolt was paused on exit, surface as officialPause so user must press resume
      if (restored.pausedOnExit && boltStarted && !boltComplete) {
        officialPause = true;
      }
    }

  });

  // Auto-open player selection when a side is missing players before bolt starts
  $effect(() => {
    if (!boltStarted && !selectionComplete && !selectModalSide) {
      selectModalSide = side1SelectionComplete ? 2 : 1;
    }
  });

  // Show coin toss after both sides selected, before first bolt only (once per Arc)
  $effect(() => {
    if (selectionComplete && !boltStarted && !serverDetermined && !showCoinToss && !teamHasHistory) {
      showCoinToss = true;
    }
  });

  // Persist clock state on hard refresh or tab close
  const handleBeforeUnload = () => pauseAndPersistOnExit();
  globalThis.addEventListener('beforeunload', handleBeforeUnload);

  onDestroy(() => {
    globalThis.removeEventListener('beforeunload', handleBeforeUnload);
    pauseAndPersistOnExit();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    destroyClock('boltTimer');
    destroyClock('serveClock');
    destroyClock('timeoutTimer');
    destroyClock('breakTimer');
  });

  // ── Event handlers (thin wiring to business logic) ──

  function afterPoint() {
    rallyInProgress = false;
    rallyCount = 0;
    // Deciding point just resolved — show the ARC result
    if (decidingPoint) {
      decidingPoint = false;
      broadcastState();
      showArcResult = true;
      return;
    }

    if (boltExpired) {
      boltComplete = true;
      endSegment({ reason: 'bolt_expired' });
      broadcastState();

      const isFinalBolt = matchComplete && !getNextTieMatchUpId(matchUpId);
      if (isFinalBolt) {
        // Check for aggregate tie → deciding point (§1.3)
        const freshLocal = getAggregateScore(getEngineState());
        const agg = {
          side1: arcBaseScore.side1 + freshLocal.side1,
          side2: arcBaseScore.side2 + freshLocal.side2,
        };
        if (agg.side1 === agg.side2) {
          decidingPoint = true;
          boltComplete = false; // allow one more point to be scored
          boltExpired = false;
        } else {
          showArcResult = true;
        }
      } else {
        startBreakClock();
      }
      return;
    }
    executeClockCommands(onPointComplete());
    broadcastState();
  }

  /**
   * Determine whether the next tieMatchUp is in a different category
   * (different collectionId). Category transitions get a 5-minute break (§2.5).
   */
  function isCategoryTransition(): boolean {
    if (!matchComplete) return false; // intra-tieMatchUp break, not category
    const nextId = getNextTieMatchUpId(matchUpId);
    if (!nextId) return false;
    const current = getTieMatchUp(matchUpId) as any;
    const next = getTieMatchUp(nextId) as any;
    return !!(current?.collectionId && next?.collectionId && current.collectionId !== next.collectionId);
  }

  function startBreakClock() {
    breakActive = true;
    breakPaused = false;
    destroyClock('breakTimer');
    pauseAllPenaltyClocks();
    const duration = isCategoryTransition() ? CATEGORY_BREAK_DURATION_MS : BREAK_DURATION_MS;
    createClock({
      id: 'breakTimer',
      durationMs: duration,
      direction: 'down',
      autoStart: true,
      tickIntervalMs: 1000,
      onExpire: handleBreakExpired,
    });
    // Tell the relay to tick the BREAK countdown for the scorebug.
    emitClockSync('running', 'break');
  }

  function handleBreakExpired() {
    // Auto-submit for authenticated officials: break IS the review period
    if (auth.hasScoreRole && getTeamMatchUpState().teamMatchUp?.tournamentId) {
      if (lastSubmittedBoltKey !== getCurrentBoltKey()) {
        submitCurrentBoltScore(); // fire-and-forget
      }
    }

    breakActive = false;
    breakPaused = false;
    destroyClock('breakTimer');
    if (matchComplete) {
      // This tieMatchUp is done — auto-advance to next in bolt sequence
      const nextId = getNextTieMatchUpId(matchUpId);
      if (nextId) {
        pauseAndPersistOnExit();
        setActiveTieMatchUp(nextId);
        const router = (globalThis as any).appRouter;
        router?.navigate(`/bolt/${nextId}`);
      }
      // No nextId = all tieMatchUps complete, stay on page
    } else {
      handleNextBolt();
    }
  }

  function pauseBreak() {
    breakPaused = true;
    pauseClock('breakTimer');
  }

  function handleNextBolt() {
    breakActive = false;
    breakPaused = false;
    destroyClock('breakTimer');
    // Resume penalty-box timers that were paused when the break began —
    // but only for players whose gender matches the incoming bolt. A
    // penalised male stays paused through WS/WD; his clock resumes only
    // on the next MS/MD/XD bolt.
    resumePenaltyClocksForBolt(getCurrentBoltContext());
    boltExpired = false;
    boltComplete = false;
    boltStarted = false;
    rallyInProgress = false;
    rallyCount = 0;
    officialPause = false;
    autoTimeSubTriggered = new Set();
    serveClockExpired = false;
    // Recalculate serve side from current aggregate (§1.4)
    const localAgg = getAggregateScore(getEngineState());
    serveSide = getServeSide({
      side1: arcBaseScore.side1 + localAgg.side1,
      side2: arcBaseScore.side2 + localAgg.side2,
    });
    // Recreate clocks for the next bolt
    destroyClock('boltTimer');
    destroyClock('serveClock');
    createClock({
      id: 'boltTimer',
      durationMs: BOLT_DURATION_MS,
      direction: 'down',
      tickIntervalMs: BOLT_TICK_MS,
      onExpire: handleBoltExpired,
      onResume: () => resumeAllOnCourtClocks(),
      onPause: () => pauseAllOnCourtClocks(),
    });
    createClock({
      id: 'serveClock',
      durationMs: SERVE_CLOCK_DURATION_MS,
      direction: 'down',
      tickIntervalMs: SERVE_TICK_MS,
      onExpire: handleServeClockExpired,
    });
  }

  function handleAction(action: string, side: Side) {
    if (boltComplete) return;
    const { winner, result } = resolvePointAttribution(action, side);
    if (winner === null) return;

    const previousServer = scoring.server as 0 | 1;
    addPoint(winner, {
      result,
      ...buildPointAttribution(winner),
      ...(rallyCount > 0 ? { rallyLength: rallyCount } : {}),
    } as any);

    // Apply INTENNSE serving rules: winner serves, serve side from aggregate.
    // recordEntry: false — this is derived from the point, not a user action;
    // without this, undo pops the setServer instead of the point.
    // Read the aggregate directly from the engine (not $derived) to ensure
    // it reflects the point we just added.
    const freshLocal = getAggregateScore(getEngineState());
    const freshAggregate = {
      side1: arcBaseScore.side1 + freshLocal.side1,
      side2: arcBaseScore.side2 + freshLocal.side2,
    };
    const serving = getServingState(winner, previousServer, freshAggregate);
    setServer(serving.server, { recordEntry: false });
    serveSide = serving.serveSide;
    rotateServerIndices(winner, previousServer);

    afterPoint();
  }

  /**
   * Build the participant-id metadata for an addPoint call. Singles passes a
   * single id per side; doubles passes the full active pair plus the rotating
   * server id. `serverParticipantId` always identifies the actual player on
   * serve (rotated within-side via updateSideServerIndices).
   */
  function buildPointAttribution(winner: 0 | 1) {
    const winnerSideIds = winner === 0 ? side1PlayerIds : side2PlayerIds;
    const winnerIdx = winner === 0 ? side1ServerIndex : side2ServerIndex;
    return {
      side1ParticipantIds: side1PlayerIds.slice(),
      side2ParticipantIds: side2PlayerIds.slice(),
      side1ServerIndex,
      side2ServerIndex,
      // Legacy single-id fields kept for any downstream consumers; for doubles
      // they hold the first slot rather than the whole pair.
      side1ParticipantId: side1PlayerIds[0] ?? '',
      side2ParticipantId: side2PlayerIds[0] ?? '',
      // For doubles winnerParticipantId reflects whichever player is cued up
      // for the winning side (not strictly "the player who hit the winner",
      // but the team's nominal server slot — the closest unambiguous proxy).
      winnerParticipantId: winnerSideIds[winnerIdx] ?? winnerSideIds[0] ?? '',
      serverParticipantId: currentServerParticipantId(),
    };
  }

  /** Apply within-side server rotation after a recorded point. */
  function rotateServerIndices(pointWinner: 0 | 1, previousServer: 0 | 1) {
    const next = updateSideServerIndices({
      pointWinner,
      previousServer,
      side1ServerIndex,
      side2ServerIndex,
    });
    side1ServerIndex = next.side1ServerIndex;
    side2ServerIndex = next.side2ServerIndex;
  }

  function handlePointStart() {
    if (boltComplete) return;
    if (!boltStarted) {
      // Block first start until each side has the required number of active
      // players selected — surface the picker for whichever side is incomplete.
      if (!selectionComplete) {
        selectModalSide = side1SelectionComplete ? 2 : 1;
        return;
      }
      // First press: start the bolt
      boltStarted = true;
      executeClockCommands(onBoltStart());
      resumeAllOnCourtClocks();
      resumePenaltyClocksForBolt(getCurrentBoltContext());
      emitClockSync('running');
      return;
    }
    if (officialPause) {
      // Resume from pause
      officialPause = false;
      resumeClock('boltTimer');
      if (!rallyInProgress) resumeClock('serveClock');
      resumePenaltyClocksForBolt(getCurrentBoltContext());
      emitClockSync('running');
      return;
    }
    // Pause everything
    officialPause = true;
    pauseClock('boltTimer');
    pauseClock('serveClock');
    pauseAllPenaltyClocks();
    emitClockSync('paused');
  }

  function handleRallyStart() {
    if (boltComplete || !boltStarted || officialPause) return;
    rallyCount++;
    if (!rallyInProgress) {
      rallyInProgress = true;
      executeClockCommands(onRallyStart());
      // Tell the relay the serve clock stopped (bolt clock still running)
      emitClockSync('running', 'bolt');
    }
  }

  function handleTimeout(side: 1 | 2) {
    // Guard: per-tieMatchUp limit (2) and per-ARC limit (5).
    if (timeoutsUsed[side] >= maxTimeoutsPerTieMatchUp) return;
    const arcUsed = getArcTimeoutsUsed();
    if (arcUsed[side] >= maxTimeoutsPerArc) return;
    timeoutSide = side;
    timeoutTeamName = side === 1 ? side1Name : side2Name;
    const serveSnapshot = getClockSnapshot('serveClock');
    serveClockWasRunning = serveSnapshot?.state === 'running';
    executeClockCommands(onTimeoutStart(serveClockWasRunning));
    pauseAllPenaltyClocks();
    // Bolt is paused but the TIMEOUT clock is now running — tell
    // the relay to tick the timeout countdown for the scorebug.
    emitClockSync('running', 'timeout');
  }

  function handleDismissTimeout() {
    if (timeoutSide) {
      timeoutsUsed[timeoutSide]++;
    }
    executeClockCommands(onTimeoutEnd(serveClockWasRunning));
    resumePenaltyClocksForBolt(getCurrentBoltContext());
    timeoutTeamName = '';
    timeoutSide = null;
    // Bolt clock resumes — switch back to bolt ticks.
    emitClockSync('running', 'bolt');
  }

  function handleCancelTimeout() {
    const timeoutSnapshot = getClockSnapshot('timeoutTimer');
    const elapsedMs = timeoutSnapshot?.elapsedMs ?? 0;
    executeClockCommands(onTimeoutEnd(serveClockWasRunning));
    resumePenaltyClocksForBolt(getCurrentBoltContext());
    timeoutTeamName = '';
    timeoutSide = null;
    emitClockSync('running', 'bolt');
  }

  function handleBoltExpired() {
    boltExpired = true;
    pauseClock('serveClock');
    pauseAllOnCourtClocks();
    emitClockSync('paused');
  }

  function handleServeClockExpired() {
    if (rallyInProgress) return;
    const boltSnapshot = getClockSnapshot('boltTimer');
    if (boltSnapshot?.state === 'expired') return;
    restartClock('serveClock');
    serveClockExpired = true;
  }

  function handleServeViolationConfirm() {
    const previousServer = scoring.server as 0 | 1;
    const receiver = (previousServer === 0 ? 1 : 0) as 0 | 1;
    addPoint(receiver, {
      result: 'Serve Clock Violation',
      ...buildPointAttribution(receiver),
    });
    const freshLocal = getAggregateScore(getEngineState());
    const freshAggregate = {
      side1: arcBaseScore.side1 + freshLocal.side1,
      side2: arcBaseScore.side2 + freshLocal.side2,
    };
    const serving = getServingState(receiver, previousServer, freshAggregate);
    setServer(serving.server, { recordEntry: false });
    serveSide = serving.serveSide;
    rotateServerIndices(receiver, previousServer);
    serveClockExpired = false;
    afterPoint();
  }

  function handleServeViolationDismiss() {
    serveClockExpired = false;
    rallyInProgress = true;
    rallyCount = 1;
    executeClockCommands(onRallyStart());
  }

  function handleSubstitute(side: 1 | 2) {
    subModalSide = side;
  }

  /**
   * Open the player-selection modal for a side. Allowed only before the bolt
   * starts; once play has begun, roster changes go through Substitute.
   */
  function handleOpenSelect(side: 1 | 2) {
    if (boltStarted) return;
    selectModalSide = side;
  }

  /**
   * Confirm the active players for a side from the selection modal. Order
   * matters: index 0 is the first server (it seeds side[N]ServerIndex = 0).
   */
  function executeSelect(selectedIds: string[]) {
    const side = selectModalSide;
    if (!side) return;

    const previousIds = side === 1 ? side1PlayerIds : side2PlayerIds;
    // Stop tracking any player that was on court but isn't in the new selection
    for (const id of previousIds) {
      if (!selectedIds.includes(id)) stopTracking(id);
    }
    // Mark the new selection as on-court (clocks don't start until bolt starts)
    for (const id of selectedIds) setOnCourt(id);

    if (side === 1) {
      side1PlayerIds = selectedIds.slice();
      side1ServerIndex = 0;
      setLineUp(1, side1PlayerIds.map((id) => ({ participantId: id })));
    } else {
      side2PlayerIds = selectedIds.slice();
      side2ServerIndex = 0;
      setLineUp(2, side2PlayerIds.map((id) => ({ participantId: id })));
    }

    // Mirror the selection onto the tieMatchUp so the scorecard reflects it
    syncTieMatchUpSidePlayers(side, selectedIds);

    selectModalSide = null;
  }

  /**
   * Replace the tieMatchUp side's participant(s) to match `selectedIds`.
   * Singles → single participant; doubles → PAIR with both individuals.
   * Looks up the full participant objects from the parent team roster.
   */
  function syncTieMatchUpSidePlayers(sideNumber: 1 | 2, selectedIds: string[]) {
    const teamMatchUp = getTeamMatchUpState().teamMatchUp as any;
    const tieMatchUp = getTieMatchUp(matchUpId) as any;
    if (!tieMatchUp?.sides) return;
    const side = tieMatchUp.sides.find((s: any) => s.sideNumber === sideNumber);
    if (!side) return;

    const teamSide = teamMatchUp?.sides?.find((s: any) => s.sideNumber === sideNumber);
    const roster: any[] = teamSide?.participant?.individualParticipants ?? [];
    const resolved = selectedIds.map(
      (id) => roster.find((p) => p?.participantId === id) ?? { participantId: id },
    );

    if (resolved.length > 1) {
      side.participant = {
        ...(side.participant ?? {}),
        participantType: 'PAIR',
        individualParticipants: resolved,
        participantName: resolved
          .map((p: any) => p?.participantName ?? '')
          .filter(Boolean)
          .join(' / '),
      };
    } else {
      side.participant = resolved[0];
    }
  }

  function executeSubstitution(outId: string, inId: string) {
    if (!subModalSide) return;
    engineSubstitute(subModalSide, outId, inId);
    stopTracking(outId);
    // Only start the new player's clock if the bolt clock is currently running
    const boltSnapshot = getClockSnapshot('boltTimer');
    if (boltSnapshot?.state === 'running') {
      startTracking(inId);
    } else {
      setOnCourt(inId);
    }
    // Replace the outgoing id in place so doubles preserves the partner's slot
    const replaceInArray = (ids: string[]): string[] => {
      const idx = ids.indexOf(outId);
      if (idx === -1) return ids;
      const next = ids.slice();
      next[idx] = inId;
      return next;
    };
    if (subModalSide === 1) {
      side1PlayerIds = replaceInArray(side1PlayerIds);
    } else {
      side2PlayerIds = replaceInArray(side2PlayerIds);
    }
    // Update the tieMatchUp's side participant so the scorecard reflects the new player
    setTieMatchUpActiveParticipant(matchUpId, subModalSide, outId, inId);
    subModalSide = null;
    penaltySubPlayer = null;
  }

  function handlePenalty(side: 1 | 2) {
    penaltyModalSide = side;
  }

  function executePenalty(participantId: string, participantName: string, points: number) {
    const side = penaltyModalSide;
    if (!side) return;

    const isOnCourt = Object.values(playerTime.players).some(
      (p) => p.participantId === participantId && p.isOnCourt,
    );
    if (isOnCourt) stopTracking(participantId);
    const boxProfile = getPenaltyBoxProfile();
    const durationMs = (boxProfile?.durationSeconds ?? 120) * 1000;
    const player = playerTime.players[participantId];
    const jerseyNumber = player?.jerseyNumber;
    const rawGender = (player?.gender ?? '').toUpperCase();
    const gender: BoltGender | undefined =
      rawGender === 'MALE' || rawGender === 'M'
        ? 'MALE'
        : rawGender === 'FEMALE' || rawGender === 'F'
          ? 'FEMALE'
          : undefined;

    // Write PENALTY_INCURRED into history.points as a scored point with
    // lifecycle metadata embedded — this IS the authoritative record.
    // `addPoint` returns the new point's index; we hand that to the box
    // so the in-memory clock knows where to decorate servedMs later.
    const receiver = (side === 1 ? 1 : 0) as 0 | 1;
    const incurredAt = new Date().toISOString();
    const pointIndex = addPoint(receiver, {
      result: 'Penalty',
      scoreValue: points,
      penaltyEvent: true,
      penaltyPoints: points,
      penaltyAgainstParticipantId: participantId,
      penaltyAgainstParticipantName: participantName,
      penaltyAgainstSideNumber: side,
      penaltyAgainstJerseyNumber: jerseyNumber,
      penaltyDurationMs: durationMs,
      penaltyGender: gender,
      timestamp: incurredAt,
      ...buildPointAttribution(receiver),
    });

    if (typeof pointIndex === 'number') {
      sendToBox(participantId, participantName, side, {
        durationMs,
        jerseyNumber,
        gender,
        sourceTieMatchUpId: matchUpId,
        sourcePointIndex: pointIndex,
        incurredAt,
        // Autostart only if we're currently in live play. Break / timeout
        // / unstarted bolts leave the clock paused; the next
        // `resumePenaltyClocksForBolt(...)` call will pick it up.
        autoStart: boltStarted && !boltComplete && !breakActive && !officialPause && !timeoutSide,
      });
    }
    broadcastState();

    penaltyModalSide = null;

    // Auto-open substitution modal if the penalized player was on court
    if (isOnCourt) {
      penaltySubPlayer = { participantId, participantName };
      subModalSide = side;
    }
  }

  function awardBreakPoints(side: 1 | 2, points: number) {
    const receiver = (side === 1 ? 0 : 1) as 0 | 1;
    addPoint(receiver, {
      result: 'PointAdjustment',
      scoreValue: points,
      adjustmentEvent: true,
      ...buildPointAttribution(receiver),
    });
    broadcastState();
  }

  let showBackConfirm = $state(false);
  let penaltyBoxModalOpen = $state(false);
  /** Phase 3: point-history detail modal (targeted undo / edit). */
  let pointDetailEntry = $state<PointHistoryEntry | null>(null);

  /** After any edit/remove, re-project the penalty box from the new history. */
  function rehydratePenaltyBox() {
    hydrateFromTeamMatchUp(getTeamMatchUpState().teamMatchUp);
  }

  function handleRemovePoint(entry: PointHistoryEntry) {
    removePoint(entry.pointIndex, { recalculate: true });
    rehydratePenaltyBox();
    broadcastState();
    if (challengingSide) challengingSide = null;
    pointDetailEntry = null;
  }

  function handleEditWinner(
    entry: PointHistoryEntry,
    nextWinningSide: 1 | 2,
    mode: 'recalculate' | 'preserveServers',
  ) {
    // Post-review correction: pin actual-observed servers into the
    // entries so the rebuild below doesn't re-derive and rewrite the
    // post-flip serve order.
    if (mode === 'preserveServers') pinEntryServersToPoints();

    // Audit metadata — written for BOTH flip modes so the viewer row
    // can surface "this point was edited" with accurate context
    // (scorekeeping error vs post-review correction; original
    // awarding side; serve-order pinned or not).
    const existingPoint = getEngineState()?.history?.points?.[entry.pointIndex];
    decoratePoint(
      entry.pointIndex,
      buildWinnerEditDecorations({
        currentWinningSide: entry.winningSide,
        mode,
        existingOriginalWinningSide: existingPoint?.originalWinningSide,
      }),
    );

    editPoint(
      entry.pointIndex,
      buildEditWinnerPayload(nextWinningSide),
      { recalculate: true },
    );
    rehydratePenaltyBox();
    broadcastState();
    if (challengingSide) challengingSide = null;
    pointDetailEntry = null;
  }

  function handleEditRallyLength(entry: PointHistoryEntry, nextRallyLength: number | undefined) {
    editPoint(
      entry.pointIndex,
      // `recalculate: false` — rally length never affects downstream score
      // or serve order; no need to replay the whole history.
      { rallyLength: nextRallyLength as any },
      { recalculate: false },
    );
    broadcastState();
    // Keep the modal open with the updated rally length visible.
    pointDetailEntry = pointDetailEntry
      ? { ...pointDetailEntry, rallyLength: nextRallyLength }
      : null;
  }

  function handleBack() {
    if (boltStarted && !boltComplete) {
      showBackConfirm = true;
      return;
    }
    pauseAndPersistOnExit();
    window.history.back();
  }

  function confirmBack() {
    showBackConfirm = false;
    pauseAndPersistOnExit();
    window.history.back();
  }

  /**
   * Pause everything and persist the full clock state so the bolt can be
   * resumed exactly where it was when the user returns.
   */
  function pauseAndPersistOnExit() {
    if (boltStarted && !boltComplete) {
      pauseClock('boltTimer');
      pauseClock('serveClock');
      pauseAllOnCourtClocks();
      officialPause = true;
    }
    pauseAllPenaltyClocks();
    // Tell the relay to stop ticking — we're leaving the page.
    emitClockSync('paused');
    const boltSnap = getClockSnapshot('boltTimer');
    const serveSnap = getClockSnapshot('serveClock');
    persistTieMatchUpState(matchUpId, {
      boltClockRemainingMs: boltSnap?.remainingMs,
      serveClockRemainingMs: serveSnap?.remainingMs,
      playerTimeSnapshots: getPlayerTimeSnapshots(),
      pausedOnExit: boltStarted && !boltComplete,
      // Flush the latest engine state — sides[i].lineUp carries the
      // current active players (post-substitution) and history.substitutions
      // has the full sub log
      score: { sets: getEngineState()?.score?.sets ?? [] },
      history: getEngineState()?.history,
      engineState: getEngineState(),
      boltStarted,
      boltExpired,
      boltComplete,
      timeoutsUsed,
      side1ServerIndex,
      side2ServerIndex,
    });
  }

  // ── Helpers ──

  /**
   * Compute total timeouts used per side across the entire ARC (all
   * tieMatchUps in the parent team matchUp). Uses the LIVE
   * `timeoutsUsed` state for the current tieMatchUp and the persisted
   * values for the others.
   */
  /** Sum coach challenges used across all tieMatchUps in this ARC. */
  function getArcChallengesUsed(): { 1: number; 2: number } {
    const team = getTeamMatchUpState().teamMatchUp as any;
    const result = { 1: 0, 2: 0 };
    for (const tie of team?.tieMatchUps ?? []) {
      if (tie.matchUpId === matchUpId) {
        result[1] += localChallengesUsed[1];
        result[2] += localChallengesUsed[2];
      } else {
        // Count challenge entries from persisted history
        const entries = tie.history?.entries ?? tie.engineState?.history?.entries ?? [];
        for (const e of entries) {
          if (e?.type === 'challenge') {
            const s = e.data?.sideNumber as 1 | 2;
            if (s) result[s]++;
          }
        }
      }
    }
    return result;
  }

  function hasChallengeRemaining(side: 1 | 2): boolean {
    const arcUsed = getArcChallengesUsed();
    return arcUsed[side] < 1;
  }

  function getArcWinnerName(): string {
    const freshLocal = getAggregateScore(getEngineState());
    const agg = {
      side1: arcBaseScore.side1 + freshLocal.side1,
      side2: arcBaseScore.side2 + freshLocal.side2,
    };
    if (agg.side1 > agg.side2) return side1Name;
    if (agg.side2 > agg.side1) return side2Name;
    return ''; // tied (shouldn't happen after deciding point)
  }

  function handleChallenge(side: 1 | 2) {
    const dataSide = swapped ? (3 - side) as 1 | 2 : side;
    if (!hasChallengeRemaining(dataSide)) return;
    recordChallengeEntry(dataSide);
    challengingSide = dataSide;
    broadcastState();
  }

  function getArcTimeoutsUsed(): { 1: number; 2: number } {
    const team = getTeamMatchUpState().teamMatchUp as any;
    const result = { 1: 0, 2: 0 };
    for (const tie of team?.tieMatchUps ?? []) {
      if (tie.matchUpId === matchUpId) {
        // Live state — persisted value may be stale mid-bolt.
        result[1] += timeoutsUsed[1];
        result[2] += timeoutsUsed[2];
      } else {
        const used = tie.timeoutsUsed;
        if (used) {
          result[1] += used[1] ?? 0;
          result[2] += used[2] ?? 0;
        }
      }
    }
    return result;
  }

  /**
   * Effective timeouts remaining for a side — the lower of per-
   * tieMatchUp remaining (2 max) and per-ARC remaining (5 max).
   * Accounts for visual swap if sides are flipped.
   */
  function effectiveTimeoutsRemaining(displaySide: 1 | 2): number {
    const dataSide = swapped ? (3 - displaySide) as 1 | 2 : displaySide;
    const perTie = maxTimeoutsPerTieMatchUp - timeoutsUsed[dataSide];
    const arcUsed = getArcTimeoutsUsed();
    const perArc = maxTimeoutsPerArc - arcUsed[dataSide];
    return Math.max(0, Math.min(perTie, perArc));
  }

  function loadArcBaseScoreFromTeam(teamMatchUp: any, currentMatchUpId: string) {
    if (!teamMatchUp) return;
    const tieMatchUps = teamMatchUp.tieMatchUps ?? [];
    let side1 = 0;
    let side2 = 0;
    for (const tm of tieMatchUps) {
      if (tm.matchUpId === currentMatchUpId) continue;
      for (const set of tm.score?.sets ?? []) {
        side1 += set.side1Score ?? 0;
        side2 += set.side2Score ?? 0;
      }
    }
    arcBaseScore = { side1, side2 };
  }

  /**
   * Notify the relay of a clock-state transition that doesn't involve
   * a point being scored — pause, resume, break, timeout, navigation.
   * The relay uses this to stop/start its ticker so the scorebug
   * display stays in sync.
   */
  function emitClockSync(
    clockState: 'running' | 'paused' | 'completed',
    activeClock?: 'bolt' | 'timeout' | 'break' | 'none',
  ) {
    const boltSnap = getClockSnapshot('boltTimer');
    const serveSnap = getClockSnapshot('serveClock');
    const timeoutSnap = getClockSnapshot('timeoutTimer');
    const breakSnap = getClockSnapshot('breakTimer');

    // Derive which clock is the active countdown if caller didn't specify
    const resolved = activeClock
      ?? (timeoutSnap?.state === 'running' ? 'timeout'
        : breakSnap?.state === 'running' ? 'break'
        : clockState === 'running' ? 'bolt'
        : 'none');

    const activeClockRemainingMs =
      resolved === 'timeout' ? (timeoutSnap?.remainingMs ?? 0)
      : resolved === 'break' ? (breakSnap?.remainingMs ?? 0)
      : undefined;

    sendClockSync({
      matchUpId,
      tournamentId: (getTeamMatchUpState().teamMatchUp as any)?.tournamentId,
      boltTimerRemainingMs: boltSnap?.remainingMs ?? 0,
      serveClockRemainingMs: serveSnap?.remainingMs ?? 0,
      activeClock: resolved,
      activeClockRemainingMs,
      serveClockRunning: serveSnap?.state === 'running',
      clockState,
    });
  }

  function broadcastState() {
    const boltTimer = getClockSnapshot('boltTimer');
    const serveClock = getClockSnapshot('serveClock');
    const state = getEngineState();
    const sets = state?.score?.sets ?? [];
    const isComplete = state?.matchUpStatus === 'COMPLETED' || boltComplete;
    const matchUpStatus = isComplete ? 'COMPLETED' : 'IN_PROGRESS';

    // Single source of truth: persist directly onto the tieMatchUp inside the team matchUp
    persistTieMatchUpState(matchUpId, {
      score: { sets },
      history: state?.history,
      matchUpStatus,
      engineState: state,
      boltStarted,
      boltExpired,
      boltComplete,
      timeoutsUsed,
      side1ServerIndex,
      side2ServerIndex,
    });

    if (boltComplete) {
      console.log('[bolt persist]', { matchUpId, sets, boltComplete, boltStarted });
    }

    const points = state?.history?.points;
    const lastPoint = points?.length ? points[points.length - 1] : undefined;

    sendScore({
      matchUpId,
      tournamentId: (getTeamMatchUpState().teamMatchUp as any)?.tournamentId,
      score: { sets },
      matchUpStatus,
      // The full CODES `Point` (winningSide, serverSideNumber, serverParticipantId
      // for doubles, …) so the relay persists point-by-point to courthive-query.
      // sendScore dedups per pointNumber, so re-broadcasts don't duplicate it.
      point: lastPoint,
      // Clock fields so the relay can anchor countdown ticks directly
      // from the score event. The intennse event carries richer data
      // but score is the reliable baseline flow.
      boltTimerRemainingMs: boltTimer?.remainingMs,
      serveClockRemainingMs: serveClock?.remainingMs,
    });

    sendIntennseUpdate(buildIntennseSnapshot({
      matchUpId,
      tournamentId: (getTeamMatchUpState().teamMatchUp as any)?.tournamentId,
      boltScore: currentBoltScore,
      aggregateScore: currentAggregateScore,
      activePlayers: scoring.activePlayers,
      server: scoring.server,
      serveSide,
      boltTimerRemainingMs: boltTimer?.remainingMs,
      serveClockRemainingMs: serveClock?.remainingMs,
      matchUpStatus,
      rallyCount,
      lastPoint,
      categoryLabel,
    }));
  }

  /**
   * Extract the active player IDs from a tieMatchUp side. For singles a side
   * has a single `participant`; for doubles it carries a PAIR participant
   * with an `individualParticipants` array. Either shape resolves to a flat
   * list of participant ids.
   */
  function extractActiveIds(side: any): string[] {
    if (!side?.participant) return [];
    const individuals = side.participant.individualParticipants;
    if (Array.isArray(individuals) && individuals.length) {
      return individuals.map((p: any) => p?.participantId).filter(Boolean);
    }
    return side.participant.participantId ? [side.participant.participantId] : [];
  }

  function initTeamRosters(matchData: any, s1ActiveIds: string[], s2ActiveIds: string[]) {
    const rosters = matchData.teamRosters;
    if (!rosters) return;

    const rosterMap: Record<string, 1 | 2> = {};

    for (const roster of rosters) {
      const side = roster.sideNumber as 1 | 2;
      registerPlayers(roster.participants);
      for (const p of roster.participants) {
        rosterMap[p.participantId] = side;
      }
    }

    sideRoster = rosterMap;

    // Mark active players as on court (clocks start when bolt starts)
    for (const id of s1ActiveIds) setOnCourt(id);
    for (const id of s2ActiveIds) setOnCourt(id);
  }

  // ── Reactive time monitoring ──

  $effect(() => {
    void playerTime.version;
    if (!boltStarted || boltComplete) return;

    let warning: { playerName: string; remainingMs: number } | null = null;

    for (const [participantId, entry] of Object.entries(playerTime.players)) {
      if (!entry.isOnCourt) continue;
      const check = checkTimeLimit(participantId);

      // Player time exhausted — force substitution (§2.8: player becomes
      // ineligible, not a conduct penalty). Opens the substitution modal
      // for the affected side so the scorekeeper can swap them out.
      if (check.exceeded && !autoTimeSubTriggered.has(participantId)) {
        autoTimeSubTriggered = new Set([...autoTimeSubTriggered, participantId]);
        const side = sideRoster[participantId] as 1 | 2 | undefined;
        if (side) {
          queueMicrotask(() => handleSubstitute(side));
        }
      }

      // Track the most urgent warning
      if (check.remainingMs <= 120000 && (!warning || check.remainingMs < warning.remainingMs)) {
        warning = { playerName: entry.participantName, remainingMs: check.remainingMs };
      }
    }

    timeWarning = warning;
  });

  // ── Layout props ──

  // Visual side swap: when swapped, left shows data-side2 and right shows data-side1
  const swapped = $derived(scoringPrefs.sidesSwapped);
  const flipSide = (side: Side): Side => swapped ? (1 - side) as Side : side;
  const flipSideNum = (side: 1 | 2): (1 | 2) => swapped ? (3 - side) as 1 | 2 : side;

  const layoutProps = $derived({
    side1Name: swapped ? side2Name : side1Name,
    side2Name: swapped ? side1Name : side2Name,
    boltLabel: boltLabel || `BOLT ${globalBoltNumber}`,
    categoryLabel,
    boltScore: swapped
      ? { side1: currentBoltScore.side2, side2: currentBoltScore.side1 }
      : currentBoltScore,
    aggregateScore: swapped
      ? { side1: currentAggregateScore.side2, side2: currentAggregateScore.side1 }
      : currentAggregateScore,
    server: swapped ? (1 - scoring.server) : scoring.server,
    serveSide,
    canUndo: scoring.canUndo,
    canRedo: scoring.canRedo,
    side1Players: swapped ? side2Players : side1Players,
    side2Players: swapped ? side1Players : side2Players,
    rallyInProgress,
    officialPause,
    boltStarted,
    boltComplete,
    boltExpired,
    matchComplete,
    decidingPoint,
    showArcResult,
    arcWinnerName: showArcResult ? getArcWinnerName() : '',
    currentBoltNumber: globalBoltNumber,
    onNextBolt: handleNextBolt,
    onWinner: (side: Side) => handleAction('winner', flipSide(side)),
    onTouch: (side: Side) => handleAction('touch', flipSide(side)),
    onForcedError: (side: Side) => handleAction('forcedError', flipSide(side)),
    onUnforcedError: (side: Side) => handleAction('unforcedError', flipSide(side)),
    onAce: (side: Side) => handleAction('ace', flipSide(side)),
    onFault: (side: Side) => handleAction('fault', flipSide(side)),
    onReceiverRallyStart: handleRallyStart,
    rallyCount,
    onUndo: () => undo(),
    onRedo: () => redo(),
    onPointStart: handlePointStart,
    onTimeout: (side: 1 | 2) => handleTimeout(flipSideNum(side)),
    onCancelTimeout: handleCancelTimeout,
    onSubstitute: (side: 1 | 2) => handleSubstitute(flipSideNum(side)),
    onPenalty: (side: 1 | 2) => handlePenalty(flipSideNum(side)),
    onSelectPlayers: (side: 1 | 2) => handleOpenSelect(flipSideNum(side)),
    selectionRequired: !selectionComplete,
    playersPerSide,
    timeoutTeamName,
    timeoutsRemaining: {
      1: effectiveTimeoutsRemaining(1),
      2: effectiveTimeoutsRemaining(2),
    },
    onDismissTimeout: handleDismissTimeout,
    onChallenge: (side: 1 | 2) => handleChallenge(side),
    challengesRemaining: {
      1: hasChallengeRemaining(swapped ? 2 : 1) ? 1 : 0,
      2: hasChallengeRemaining(swapped ? 1 : 2) ? 1 : 0,
    },
    playerTimePanelOpen,
    playerTimeSide,
    onTogglePlayerTimeSide: (side: 1 | 2) => {
      if (playerTimeSide === side) {
        playerTimePanelOpen = false;
        playerTimeSide = null;
      } else {
        playerTimePanelOpen = true;
        playerTimeSide = side;
      }
    },
    sideRoster,
    breakActive,
    breakPaused,
    isLastBoltBreak: matchComplete && breakActive,
    onPauseBreak: pauseBreak,
    onStartNextBolt: () => {
      if (matchComplete) {
        handleBreakExpired();
      } else {
        handleNextBolt();
      }
    },
    onAwardBreakPoints: (side: 1 | 2, points: number) => awardBreakPoints(flipSideNum(side), points),
    onBack: handleBack,
    onPenaltyBoxTap: () => { penaltyBoxModalOpen = true; },
    showForcedError: scoringPrefs.showForcedError ?? isLandscape,
    canSubmitScore: !!getTeamMatchUpState().teamMatchUp?.tournamentId,
    scoreSubmitting,
    onSubmitScore: handleManualSubmit,
    historyPoints,
    historyEntries,
    participantNames,
    sidesSwapped: swapped,
    compactFooter: isMobile,
    onHistoryEntryTap: (entry: PointHistoryEntry) => { pointDetailEntry = entry; },
    onDeleteChallengeEntry: (entry: PointHistoryEntry) => {
      if (entry.entryType === 'challenge' && entry.entryIndex !== undefined) {
        removeChallengeEntry(entry.entryIndex);
        broadcastState();
      }
    },
  });
</script>

<div class="intennse-bolt-page">
  {#if timeWarning}
    <div class="intennse-warnings">
      <PlayerTimeWarning
        playerName={timeWarning.playerName}
        remainingMs={timeWarning.remainingMs}
        onDismiss={() => (timeWarning = null)}
      />
    </div>
  {/if}

  {#if penaltyBoxModalOpen}
    <PenaltyBoxDetailModal onClose={() => (penaltyBoxModalOpen = false)} />
  {/if}

  {#if pointDetailEntry}
    <PointDetailModal
      entry={pointDetailEntry}
      {side1Name}
      {side2Name}
      onClose={() => { pointDetailEntry = null; challengingSide = null; }}
      onRemove={handleRemovePoint}
      onEditWinner={handleEditWinner}
      onEditRallyLength={handleEditRallyLength}
    />
  {/if}

  {#if showLoginModal}
    <LoginModal
      onClose={() => (showLoginModal = false)}
      onSuccess={() => { showLoginModal = false; submitCurrentBoltScore(); }}
    />
  {/if}

  {#if isLandscape}
    <HorizontalBolt {...layoutProps} />
  {:else}
    <VerticalBolt {...layoutProps} />
  {/if}

  {#if serveClockExpired}
    <div class="serve-violation-overlay" role="dialog" aria-label="Serve clock violation">
      <div class="serve-violation-card">
        <div class="serve-violation-title">Serve Clock Expired</div>
        <button class="serve-violation-btn serve-violation-btn--confirm" onclick={handleServeViolationConfirm}>
          Point Lost by Server
        </button>
        <button class="serve-violation-btn serve-violation-btn--dismiss" onclick={handleServeViolationDismiss}>
          Point Started
        </button>
      </div>
    </div>
  {/if}

  {#if penaltyModalSide}
    <PenaltyModal
      side={penaltyModalSide}
      teamName={penaltyModalSide === 1 ? side1Name : side2Name}
      activePlayers={
        Object.values(playerTime.players)
          .filter((p) => p.isOnCourt && sideRoster[p.participantId] === penaltyModalSide)
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber, gender: p.gender }))
      }
      benchPlayers={
        getBenchPlayers(penaltyModalSide, sideRoster)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber, gender: p.gender }))
      }
      onConfirm={executePenalty}
      onClose={() => (penaltyModalSide = null)}
    />
  {/if}

  {#if subModalSide}
    {@const boltCtx = getCurrentBoltContext()}
    {@const benchGender = boltCtx.gender === 'MIXED' ? undefined : boltCtx.gender}
    {@const isMixedBolt = boltCtx.gender === 'MIXED'}
    <SubstitutionModal
      side={subModalSide}
      preSelectedOut={penaltySubPlayer?.participantId}
      {isMixedBolt}
      activePlayers={
        penaltySubPlayer
          ? [{ ...penaltySubPlayer, gender: playerTime.players[penaltySubPlayer.participantId]?.gender },
             ...Object.values(playerTime.players)
              .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide && p.participantId !== penaltySubPlayer.participantId)
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber, gender: p.gender }))]
          : Object.values(playerTime.players)
              .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide)
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber, gender: p.gender }))
      }
      benchPlayers={
        getBenchPlayers(subModalSide, sideRoster, benchGender as any)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, gender: p.gender, jerseyNumber: p.jerseyNumber }))
      }
      onSubstitute={executeSubstitution}
      onClose={() => { subModalSide = null; penaltySubPlayer = null; }}
    />
  {/if}

  {#if selectModalSide}
    {@const sideForSelect = selectModalSide}
    <PlayerSelectModal
      side={sideForSelect}
      teamName={sideForSelect === 1 ? side1Name : side2Name}
      roster={
        Object.values(playerTime.players)
          .filter((p) => sideRoster[p.participantId] === sideForSelect)
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))
      }
      currentIds={sideForSelect === 1 ? side1PlayerIds : side2PlayerIds}
      requiredCount={playersPerSide as 1 | 2}
      onConfirm={executeSelect}
      onClose={() => (selectModalSide = null)}
    />
  {/if}
  {#if showCoinToss}
    <CoinTossModal
      side1Name={side1Name}
      side2Name={side2Name}
      onResult={(servingSide) => {
        showCoinToss = false;
        serverDetermined = true;
        setServer(servingSide);
      }}
      onClose={() => {
        showCoinToss = false;
        serverDetermined = true;
      }}
    />
  {/if}
  {#if showBackConfirm}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="back-confirm-overlay" onclick={() => (showBackConfirm = false)}>
      <div class="back-confirm-modal" onclick={(e) => e.stopPropagation()}>
        <div class="back-confirm-title">Leave active Bolt?</div>
        <div class="back-confirm-msg">Clocks are still running. Are you sure you want to return to the Scorecard?</div>
        <div class="back-confirm-buttons">
          <button class="back-confirm-btn back-confirm-btn--cancel" onclick={() => (showBackConfirm = false)}>
            Continue Bolt
          </button>
          <button class="back-confirm-btn back-confirm-btn--leave" onclick={confirmBack}>
            Leave
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .back-confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .back-confirm-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 2px solid var(--intennse-serving, #00d4aa);
    border-radius: 12px;
    padding: 1.2rem;
    min-width: 260px;
    max-width: 340px;
    width: 85%;
    text-align: center;
  }
  .back-confirm-title {
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }
  .back-confirm-msg {
    font-size: 0.8rem;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 1rem;
    line-height: 1.4;
  }
  .back-confirm-buttons {
    display: flex;
    gap: 0.5rem;
  }
  .back-confirm-btn {
    flex: 1;
    padding: 0.6rem;
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }
  .back-confirm-btn:active { opacity: 0.7; }
  .back-confirm-btn--cancel {
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
  }
  .back-confirm-btn--leave {
    background: var(--intennse-accent, #0f3460);
    color: var(--intennse-text, #e0e0e0);
  }

  .intennse-bolt-page {
    height: 100%;
    width: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .intennse-warnings {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1500;
    padding: 0.3rem;
  }
  .serve-violation-overlay {
    position: absolute;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
  }
  .serve-violation-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: var(--intennse-surface, #1e1e2e);
    min-width: 260px;
    max-width: 90vw;
  }
  .serve-violation-title {
    text-align: center;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--intennse-text, #fff);
  }
  .serve-violation-btn {
    padding: 1rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .serve-violation-btn--confirm {
    background: var(--intennse-error, #ef5350);
    color: #fff;
  }
  .serve-violation-btn--dismiss {
    background: var(--intennse-winner, #00d4aa);
    color: #000;
  }
</style>
