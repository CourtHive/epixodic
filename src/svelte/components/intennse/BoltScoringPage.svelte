<script lang="ts">
  import HorizontalBolt from './HorizontalBolt.svelte';
  import VerticalBolt from './VerticalBolt.svelte';
  import SubstitutionModal from './SubstitutionModal.svelte';
  import PlayerSelectModal from './PlayerSelectModal.svelte';
  import PenaltyModal from './PenaltyModal.svelte';
  import PenaltyBoxDetailModal from './PenaltyBoxDetailModal.svelte';
  import PlayerTimeWarning from './PlayerTimeWarning.svelte';
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
  } from '../../stores/playerTime.svelte';
  import { sendToBox, isInBox } from '../../stores/penaltyBox.svelte';
  import { buildIntennseSnapshot } from '../../../services/intennseStats';
  import { sendScore, sendIntennseUpdate } from '../../../services/messaging/scoreRelay';
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
  } from '../../stores/teamMatchUp.svelte';
  import { fetchParentMatchUp, hydrateBoltHistoryOnMount } from '../../../services/messaging/boltHistoryApi';
  import { getLoginState } from '../../../services/auth/loginState';
  import { fixtures } from 'tods-competition-factory';
  import { onMount, onDestroy } from 'svelte';

  const INTENNSE_STANDARD = fixtures.competitionFormats.INTENNSE_STANDARD;

  // Business logic — independently testable
  import { resolvePointAttribution, type Side } from '../../../intennse/pointRules';
  import {
    onBoltStart, onRallyStart, onPointComplete, onTimeoutStart, onTimeoutEnd,
    BOLT_DURATION_MS, SERVE_CLOCK_DURATION_MS, BOLT_TICK_MS, SERVE_TICK_MS,
    type ClockCommand,
  } from '../../../intennse/clockOrchestration';
  import { getCurrentBoltScore, getAggregateScore } from '../../../intennse/scoreComputation';
  import { getServingState, updateSideServerIndices, type ServeSide } from '../../../intennse/servingRules';

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

  let rallyInProgress = $state(false);
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
  let timeoutsUsed = $state<{ 1: number; 2: number }>({ 1: 0, 2: 0 });
  const maxTimeoutsPerSide = (INTENNSE_STANDARD as any).timeoutRules?.maxPerSide ?? 5;
  let serveSide = $state<ServeSide>('DEUCE');
  let isLandscape = $state(window.innerWidth > window.innerHeight);

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
  let sideRoster = $state<Record<string, 1 | 2>>({});
  let playerTimePanelOpen = $state(false);
  let timeWarning = $state<{ playerName: string; remainingMs: number } | null>(null);
  let autoTimePenaltyTriggered = $state<Set<string>>(new Set());

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

  const matchComplete = $derived.by(() => {
    void scoring.version;
    return scoring.isComplete;
  });

  const currentBoltNumber = $derived.by(() => {
    void scoring.version;
    const sets = getEngineState()?.score?.sets ?? [];
    // No bolts started yet → next bolt is bolt 1
    if (sets.length === 0) return 1;
    // Last bolt complete → showing the just-finished bolt's number; NEXT BOLT button will display N+1
    return sets.length;
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
      if (tieMatchUp.timeoutsUsed) timeoutsUsed = tieMatchUp.timeoutsUsed;
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

    // If the bolt hasn't started yet and either side is missing players,
    // surface the picker for whichever side needs attention first.
    if (!boltStarted && !selectionComplete) {
      selectModalSide = side1SelectionComplete ? 2 : 1;
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
    if (boltExpired) {
      boltComplete = true;
      endSegment({ reason: 'bolt_expired' });
      broadcastState();
      if (!matchComplete) startBreakClock();
      return;
    }
    executeClockCommands(onPointComplete());
    broadcastState();
  }

  function startBreakClock() {
    breakActive = true;
    breakPaused = false;
    destroyClock('breakTimer');
    createClock({
      id: 'breakTimer',
      durationMs: BREAK_DURATION_MS,
      direction: 'down',
      autoStart: true,
      tickIntervalMs: 1000,
      onExpire: handleBreakExpired,
    });
  }

  function handleBreakExpired() {
    breakActive = false;
    breakPaused = false;
    destroyClock('breakTimer');
    if (!matchComplete) handleNextBolt();
  }

  function pauseBreak() {
    breakPaused = true;
    pauseClock('breakTimer');
  }

  function handleNextBolt() {
    breakActive = false;
    breakPaused = false;
    destroyClock('breakTimer');
    boltExpired = false;
    boltComplete = false;
    boltStarted = false;
    rallyInProgress = false;
    officialPause = false;
    autoTimePenaltyTriggered = new Set();
    serveClockExpired = false;
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
    } as any);

    // Apply INTENNSE serving rules: winner serves, serve side from aggregate
    const serving = getServingState(winner, previousServer, currentAggregateScore);
    setServer(serving.server);
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
      return;
    }
    if (officialPause) {
      // Resume from pause
      officialPause = false;
      resumeClock('boltTimer');
      if (!rallyInProgress) resumeClock('serveClock');
      return;
    }
    // Pause everything
    officialPause = true;
    pauseClock('boltTimer');
    pauseClock('serveClock');
  }

  function handleRallyStart() {
    if (boltComplete || !boltStarted || rallyInProgress || officialPause) return;
    rallyInProgress = true;
    executeClockCommands(onRallyStart());
  }

  function handleTimeout(side: 1 | 2) {
    if (timeoutsUsed[side] >= maxTimeoutsPerSide) return;
    timeoutSide = side;
    timeoutTeamName = side === 1 ? side1Name : side2Name;
    const serveSnapshot = getClockSnapshot('serveClock');
    serveClockWasRunning = serveSnapshot?.state === 'running';
    executeClockCommands(onTimeoutStart(serveClockWasRunning));
  }

  function handleDismissTimeout() {
    if (timeoutSide) {
      timeoutsUsed[timeoutSide]++;
    }
    executeClockCommands(onTimeoutEnd(serveClockWasRunning));
    timeoutTeamName = '';
    timeoutSide = null;
  }

  function handleCancelTimeout() {
    // Return elapsed time to bolt clock by resuming without counting the timeout
    const timeoutSnapshot = getClockSnapshot('timeoutTimer');
    const elapsedMs = timeoutSnapshot?.elapsedMs ?? 0;
    executeClockCommands(onTimeoutEnd(serveClockWasRunning));
    // Bolt clock resumed by onTimeoutEnd; no timeout counted
    timeoutTeamName = '';
    timeoutSide = null;
  }

  function handleBoltExpired() {
    boltExpired = true;
    pauseClock('serveClock');
    pauseAllOnCourtClocks();
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
    const serving = getServingState(receiver, previousServer, currentAggregateScore);
    setServer(serving.server);
    serveSide = serving.serveSide;
    rotateServerIndices(receiver, previousServer);
    serveClockExpired = false;
    afterPoint();
  }

  function handleServeViolationDismiss() {
    serveClockExpired = false;
    rallyInProgress = true;
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

    // Send player to penalty box
    const isOnCourt = Object.values(playerTime.players).some(
      (p) => p.participantId === participantId && p.isOnCourt,
    );
    if (isOnCourt) stopTracking(participantId);
    const boxProfile = getPenaltyBoxProfile();
    const durationMs = (boxProfile?.durationSeconds ?? 120) * 1000;
    const jerseyNumber = playerTime.players[participantId]?.jerseyNumber;
    sendToBox(participantId, participantName, side, durationMs, undefined, jerseyNumber);

    // Award penalty as a single event (one point record with scoreValue = points)
    const receiver = (side === 1 ? 1 : 0) as 0 | 1;
    addPoint(receiver, {
      result: 'Penalty',
      scoreValue: points,
      penaltyEvent: true,
      penaltyPoints: points,
      penaltyAgainstParticipantId: participantId,
      ...buildPointAttribution(receiver),
    });
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

    sendScore({ matchUpId, score: { sets }, matchUpStatus });

    sendIntennseUpdate(buildIntennseSnapshot({
      matchUpId,
      boltScore: currentBoltScore,
      aggregateScore: currentAggregateScore,
      activePlayers: scoring.activePlayers,
      server: scoring.server,
      boltTimerRemainingMs: boltTimer?.remainingMs,
      serveClockRemainingMs: serveClock?.remainingMs,
      matchUpStatus,
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

      // Auto-penalty when time is exhausted
      if (check.exceeded && !autoTimePenaltyTriggered.has(participantId)) {
        autoTimePenaltyTriggered = new Set([...autoTimePenaltyTriggered, participantId]);
        const side = sideRoster[participantId] as 1 | 2 | undefined;
        if (side) {
          // Defer to avoid mutating state during effect
          queueMicrotask(() => handlePenalty(side));
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

  const layoutProps = $derived({
    side1Name,
    side2Name,
    boltLabel: boltLabel || `BOLT ${currentBoltNumber}`,
    boltScore: currentBoltScore,
    aggregateScore: currentAggregateScore,
    server: scoring.server,
    serveSide,
    canUndo: scoring.canUndo,
    canRedo: scoring.canRedo,
    side1Players,
    side2Players,
    rallyInProgress,
    officialPause,
    boltStarted,
    boltComplete,
    boltExpired,
    matchComplete,
    currentBoltNumber,
    onNextBolt: handleNextBolt,
    onWinner: (side: Side) => handleAction('winner', side),
    onTouch: (side: Side) => handleAction('touch', side),
    onForcedError: (side: Side) => handleAction('forcedError', side),
    onUnforcedError: (side: Side) => handleAction('unforcedError', side),
    onAce: (side: Side) => handleAction('ace', side),
    onFault: (side: Side) => handleAction('fault', side),
    onReceiverRallyStart: handleRallyStart,
    onUndo: () => undo(),
    onRedo: () => redo(),
    onPointStart: handlePointStart,
    onTimeout: handleTimeout,
    onCancelTimeout: handleCancelTimeout,
    onSubstitute: handleSubstitute,
    onPenalty: handlePenalty,
    onSelectPlayers: handleOpenSelect,
    selectionRequired: !selectionComplete,
    playersPerSide,
    timeoutTeamName,
    timeoutsRemaining: { 1: maxTimeoutsPerSide - timeoutsUsed[1], 2: maxTimeoutsPerSide - timeoutsUsed[2] },
    onDismissTimeout: handleDismissTimeout,
    playerTimePanelOpen,
    onTogglePlayerTimePanel: () => { playerTimePanelOpen = !playerTimePanelOpen; },
    sideRoster,
    breakActive,
    breakPaused,
    onPauseBreak: pauseBreak,
    onStartNextBolt: handleNextBolt,
    onAwardBreakPoints: awardBreakPoints,
    onBack: handleBack,
    onPenaltyBoxTap: () => { penaltyBoxModalOpen = true; },
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
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber }))
      }
      benchPlayers={
        getBenchPlayers(penaltyModalSide, sideRoster)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber }))
      }
      onConfirm={executePenalty}
      onClose={() => (penaltyModalSide = null)}
    />
  {/if}

  {#if subModalSide}
    <SubstitutionModal
      side={subModalSide}
      preSelectedOut={penaltySubPlayer?.participantId}
      activePlayers={
        penaltySubPlayer
          ? [penaltySubPlayer, ...Object.values(playerTime.players)
              .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide && p.participantId !== penaltySubPlayer.participantId)
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber }))]
          : Object.values(playerTime.players)
              .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide)
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName, jerseyNumber: p.jerseyNumber }))
      }
      benchPlayers={
        getBenchPlayers(subModalSide, sideRoster)
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
