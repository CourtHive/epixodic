<script lang="ts">
  import HorizontalBolt from './HorizontalBolt.svelte';
  import VerticalBolt from './VerticalBolt.svelte';
  import SubstitutionModal from './SubstitutionModal.svelte';
  import PenaltyModal from './PenaltyModal.svelte';
  import PenaltyBoxDisplay from './PenaltyBoxDisplay.svelte';
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
    restoreTeamMatchUp,
    findParentMatchUpId,
  } from '../../stores/teamMatchUp.svelte';
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
  import { getServingState, type ServeSide } from '../../../intennse/servingRules';

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

  let rallyInProgress = $state(false);
  let officialPause = $state(false);
  let boltStarted = $state(false);
  let boltExpired = $state(false);
  let boltComplete = $state(false);
  let serveClockExpired = $state(false);
  let serveClockWasRunning = false;
  let arcBaseScore = $state({ side1: 0, side2: 0 });
  let timeoutTeamName = $state('');
  let timeoutSide = $state<1 | 2 | null>(null);
  let timeoutsUsed = $state<{ 1: number; 2: number }>({ 1: 0, 2: 0 });
  const maxTimeoutsPerSide = (INTENNSE_STANDARD as any).timeoutRules?.maxPerSide ?? 5;
  let serveSide = $state<ServeSide>('DEUCE');
  let isLandscape = $state(window.innerWidth > window.innerHeight);

  let side1PlayerId = $state<string>('');
  let side2PlayerId = $state<string>('');
  const side1Player = $derived(side1PlayerId ? (playerTime.players[side1PlayerId]?.participantName ?? '') : '');
  const side2Player = $derived(side2PlayerId ? (playerTime.players[side2PlayerId]?.participantName ?? '') : '');
  let side1CourtTimeMs = $derived.by(() => {
    void playerTime.version;
    const entry = side1PlayerId ? playerTime.players[side1PlayerId] : undefined;
    return entry ? Math.max(0, playerTime.maxCourtTimeMs - entry.clock.getElapsedMs()) : 0;
  });
  let side2CourtTimeMs = $derived.by(() => {
    void playerTime.version;
    const entry = side2PlayerId ? playerTime.players[side2PlayerId] : undefined;
    return entry ? Math.max(0, playerTime.maxCourtTimeMs - entry.clock.getElapsedMs()) : 0;
  });

  let subModalSide = $state<1 | 2 | null>(null);
  let penaltySubPlayer = $state<{ participantId: string; participantName: string } | null>(null);
  let penaltyModalSide = $state<1 | 2 | null>(null);
  let sideRoster = $state<Record<string, 1 | 2>>({});
  let playerTimePanelOpen = $state(false);
  let timeWarning = $state<{ playerName: string; remainingMs: number } | null>(null);
  let autoTimePenaltyTriggered = $state<Set<string>>(new Set());

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

  onMount(() => {
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
      initScoringEngine({ matchUpFormat: format, competitionFormat });

      // Team names from the parent team matchUp's sides
      const s1 = tieMatchUp.sides?.[0];
      const s2 = tieMatchUp.sides?.[1];
      const ts1 = parentMatchUp?.sides?.[0];
      const ts2 = parentMatchUp?.sides?.[1];
      if (ts1?.participant?.participantName) side1Name = ts1.participant.participantName;
      if (ts2?.participant?.participantName) side2Name = ts2.participant.participantName;
      if (s1?.teamParticipant?.participantName) side1Name = s1.teamParticipant.participantName;
      if (s2?.teamParticipant?.participantName) side2Name = s2.teamParticipant.participantName;

      // Restore previous engine state if present (must run before deriving active players)
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

      // Active player IDs — derive from engine's current lineUp (reflects substitutions).
      // Fall back to original tieMatchUp.sides assignment for fresh engines.
      const restoredEngineSides = getEngineState()?.sides ?? [];
      const engineSide1ActiveId = restoredEngineSides[0]?.lineUp?.[0]?.participantId;
      const engineSide2ActiveId = restoredEngineSides[1]?.lineUp?.[0]?.participantId;
      side1PlayerId = engineSide1ActiveId || s1?.participant?.participantId || '';
      side2PlayerId = engineSide2ActiveId || s2?.participant?.participantId || '';

      // Register team rosters for substitution support
      const teamRosters = parentMatchUp?.sides?.map((side: any) => ({
        sideNumber: side.sideNumber,
        participants: side.participant?.individualParticipants?.map((p: any) => ({
          participantId: p.participantId,
          participantName: p.participantName,
          gender: p.person?.sex || p.person?.gender,
        })) ?? [],
      })) ?? [];
      // Build synthetic s1/s2 with the actual active player IDs (post-substitution)
      const activeS1 = { participant: { participantId: side1PlayerId } };
      const activeS2 = { participant: { participantId: side2PlayerId } };
      initTeamRosters({ teamRosters }, activeS1, activeS2);

      // Ensure the engine has lineUps so engine.substitute() works on subsequent subs
      if (!engineSide1ActiveId && side1PlayerId) {
        setLineUp(1, [{ participantId: side1PlayerId }]);
      }
      if (!engineSide2ActiveId && side2PlayerId) {
        setLineUp(2, [{ participantId: side2PlayerId }]);
      }

      // Compute ARC base from other tieMatchUps in the team matchUp
      loadArcBaseScoreFromTeam(parentMatchUp, matchUpId);
      if (tieMatchUp.timeoutsUsed) timeoutsUsed = tieMatchUp.timeoutsUsed;

      console.log('[bolt mount]', {
        matchUpId,
        format,
        source: 'tieMatchUp',
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
  });

  onDestroy(() => {
    pauseAndPersistOnExit();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    destroyClock('boltTimer');
    destroyClock('serveClock');
    destroyClock('timeoutTimer');
  });

  // ── Event handlers (thin wiring to business logic) ──

  function afterPoint() {
    rallyInProgress = false;
    if (boltExpired) {
      boltComplete = true;
      endSegment({ reason: 'bolt_expired' });
      broadcastState();
      return;
    }
    executeClockCommands(onPointComplete());
    broadcastState();
  }

  function handleNextBolt() {
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

    const winnerParticipantId = winner === 0 ? side1PlayerId : side2PlayerId;

    addPoint(winner, {
      result,
      side1ParticipantId: side1PlayerId,
      side2ParticipantId: side2PlayerId,
      winnerParticipantId,
    } as any);

    // Apply INTENNSE serving rules: winner serves, serve side from aggregate
    const serving = getServingState(winner, scoring.server, currentAggregateScore);
    setServer(serving.server);
    serveSide = serving.serveSide;

    afterPoint();
  }

  function handlePointStart() {
    if (boltComplete) return;
    if (!boltStarted) {
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
    const receiver = scoring.server === 0 ? 1 : 0;
    const winnerParticipantId = receiver === 0 ? side1PlayerId : side2PlayerId;
    addPoint(receiver as 0 | 1, {
      result: 'Serve Clock Violation',
      side1ParticipantId: side1PlayerId,
      side2ParticipantId: side2PlayerId,
      winnerParticipantId,
    });
    const serving = getServingState(receiver, scoring.server, currentAggregateScore);
    setServer(serving.server);
    serveSide = serving.serveSide;
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
    if (subModalSide === 1) {
      side1PlayerId = inId;
    } else {
      side2PlayerId = inId;
    }
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
    sendToBox(participantId, participantName, side, durationMs);

    // Award penalty as a single event (one point record with scoreValue = points)
    const receiver = side === 1 ? 1 : 0;
    const winnerParticipantId = receiver === 0 ? side1PlayerId : side2PlayerId;
    addPoint(receiver as 0 | 1, {
      result: 'Penalty',
      scoreValue: points,
      penaltyEvent: true,
      penaltyPoints: points,
      penaltyAgainstParticipantId: participantId,
      side1ParticipantId: side1PlayerId,
      side2ParticipantId: side2PlayerId,
      winnerParticipantId,
    });
    broadcastState();

    penaltyModalSide = null;

    // Auto-open substitution modal if the penalized player was on court
    if (isOnCourt) {
      penaltySubPlayer = { participantId, participantName };
      subModalSide = side;
    }
  }

  function handleBack() {
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

  function initTeamRosters(matchData: any, s1: any, s2: any) {
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
    const s1ActiveId = s1?.participant?.participantId;
    const s2ActiveId = s2?.participant?.participantId;
    if (s1ActiveId) setOnCourt(s1ActiveId);
    if (s2ActiveId) setOnCourt(s2ActiveId);
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
    side1Player,
    side2Player,
    side1CourtTimeMs,
    side2CourtTimeMs,
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
    timeoutTeamName,
    timeoutsRemaining: { 1: maxTimeoutsPerSide - timeoutsUsed[1], 2: maxTimeoutsPerSide - timeoutsUsed[2] },
    onDismissTimeout: handleDismissTimeout,
    playerTimePanelOpen,
    onTogglePlayerTimePanel: () => { playerTimePanelOpen = !playerTimePanelOpen; },
    sideRoster,
    onBack: handleBack,
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

  <div class="intennse-penalty-bar">
    <div class="intennse-penalty-bar-side intennse-penalty-bar-side--left">
      <PenaltyBoxDisplay sideNumber={1} />
    </div>
    <div class="intennse-penalty-bar-spacer"></div>
    <div class="intennse-penalty-bar-side intennse-penalty-bar-side--right">
      <PenaltyBoxDisplay sideNumber={2} />
    </div>
  </div>

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
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))
      }
      benchPlayers={
        getBenchPlayers(penaltyModalSide, sideRoster)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))
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
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))]
          : Object.values(playerTime.players)
              .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide)
              .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))
      }
      benchPlayers={
        getBenchPlayers(subModalSide, sideRoster)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, gender: p.gender }))
      }
      onSubstitute={executeSubstitution}
      onClose={() => { subModalSide = null; penaltySubPlayer = null; }}
    />
  {/if}
</div>

<style>
  .intennse-bolt-page {
    height: 100%;
    width: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .intennse-penalty-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    min-height: 0;
  }
  .intennse-penalty-bar-side {
    display: flex;
  }
  .intennse-penalty-bar-side--left {
    justify-content: flex-end;
  }
  .intennse-penalty-bar-side--right {
    justify-content: flex-start;
  }
  .intennse-penalty-bar-spacer {
    min-width: 200px;
    flex-shrink: 0;
  }
  .intennse-penalty-bar:not(:has(.penalty-box-display)) {
    display: none;
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
