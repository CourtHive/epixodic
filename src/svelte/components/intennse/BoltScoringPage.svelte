<script lang="ts">
  import HorizontalBolt from './HorizontalBolt.svelte';
  import VerticalBolt from './VerticalBolt.svelte';
  import SubstitutionModal from './SubstitutionModal.svelte';
  import PenaltyBoxDisplay from './PenaltyBoxDisplay.svelte';
  import PlayerTimeWarning from './PlayerTimeWarning.svelte';
  import {
    getScoringState,
    getEngineState,
    initScoringEngine,
    addPoint,
    undo,
    redo,
    setServer,
    substitute as engineSubstitute,
    getPenaltyBoxProfile,
  } from '../../stores/scoringEngine.svelte';
  import {
    getPlayerTimeState,
    registerPlayers,
    startTracking,
    handleSubstitution as trackSubstitution,
    getRemainingMs,
    checkTimeLimit,
    getBenchPlayers,
    stopTracking,
  } from '../../stores/playerTime.svelte';
  import { sendToBox, isInBox } from '../../stores/penaltyBox.svelte';
  import { buildIntennseSnapshot } from '../../../services/intennseStats';
  import { sendScore, sendIntennseUpdate } from '../../../services/messaging/scoreRelay';
  import { getClockSnapshot, createClock, destroyClock, restartClock, pauseClock, resumeClock } from '../../../clock';
  import { browserStorage } from '../../../state/browserStorage';
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
  let boltStarted = $state(false);
  let serveClockExpired = $state(false);
  let serveClockWasRunning = false;
  let timeoutTeamName = $state('');
  let serveSide = $state<ServeSide>('DEUCE');
  let isLandscape = $state(window.innerWidth > window.innerHeight);

  let side1Player = $state('Player 1');
  let side2Player = $state('Player 2');
  let side1CourtTimeMs = $derived(side1Player ? getRemainingMs(side1Player) : 0);
  let side2CourtTimeMs = $derived(side2Player ? getRemainingMs(side2Player) : 0);

  let subModalSide = $state<1 | 2 | null>(null);
  let sideRoster = $state<Record<string, 1 | 2>>({});
  let timeWarning = $state<{ playerName: string; remainingMs: number } | null>(null);

  // ── Derived scores (read engine directly, version triggers reactivity) ──

  const currentBoltScore = $derived.by(() => {
    void scoring.version;
    return getCurrentBoltScore(getEngineState());
  });

  const currentAggregateScore = $derived.by(() => {
    void scoring.version;
    return getAggregateScore(getEngineState());
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

    const stored = browserStorage.get(matchUpId);
    if (stored) {
      try {
        const matchData = JSON.parse(stored);
        const format = matchData.matchUpFormat || matchData.competitionFormat?.matchUpFormat || 'SET7XA-S:T10P';
        const competitionFormat = matchData.competitionFormat ?? INTENNSE_STANDARD;
        initScoringEngine({ matchUpFormat: format, competitionFormat });

        // Team names are hydrated onto tieMatchUp sides as .teamParticipant
        const s1 = matchData.sides?.[0];
        const s2 = matchData.sides?.[1];
        if (s1?.teamParticipant?.participantName) side1Name = s1.teamParticipant.participantName;
        if (s2?.teamParticipant?.participantName) side2Name = s2.teamParticipant.participantName;

        // Active player names from the tieMatchUp sides
        if (s1?.participant?.participantName) side1Player = s1.participant.participantName;
        if (s2?.participant?.participantName) side2Player = s2.participant.participantName;

        // Register team rosters for substitution support
        initTeamRosters(matchData, s1, s2);
      } catch {
        initScoringEngine({ matchUpFormat: 'SET7XA-S:T10P', competitionFormat: INTENNSE_STANDARD });
      }
    } else {
      initScoringEngine({ matchUpFormat: 'SET7XA-S:T10P', competitionFormat: INTENNSE_STANDARD });
    }

    createClock({ id: 'boltTimer', durationMs: BOLT_DURATION_MS, direction: 'down', tickIntervalMs: BOLT_TICK_MS });
    createClock({
      id: 'serveClock',
      durationMs: SERVE_CLOCK_DURATION_MS,
      direction: 'down',
      tickIntervalMs: SERVE_TICK_MS,
      onExpire: handleServeClockExpired,
    });
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    destroyClock('boltTimer');
    destroyClock('serveClock');
    destroyClock('timeoutTimer');
  });

  // ── Event handlers (thin wiring to business logic) ──

  function afterPoint() {
    rallyInProgress = false;
    executeClockCommands(onPointComplete());
    checkPlayerTimeLimits();
    broadcastState();
  }

  function handleAction(action: string, side: Side) {
    const { winner, result } = resolvePointAttribution(action, side);
    if (winner === null) {
      // Fault: no point awarded
    } else {
      addPoint(winner, { result });
    }

    // Apply INTENNSE serving rules: winner serves, serve side from aggregate
    const serving = getServingState(winner, scoring.server, currentAggregateScore);
    setServer(serving.server);
    serveSide = serving.serveSide;

    afterPoint();
  }

  function handlePointStart() {
    if (!boltStarted) {
      boltStarted = true;
      executeClockCommands(onBoltStart());
      return;
    }
    if (!rallyInProgress) {
      rallyInProgress = true;
      executeClockCommands(onRallyStart());
    }
  }

  function handleTimeout(side: 1 | 2) {
    timeoutTeamName = side === 1 ? side1Name : side2Name;
    const serveSnapshot = getClockSnapshot('serveClock');
    serveClockWasRunning = serveSnapshot?.state === 'running';
    executeClockCommands(onTimeoutStart(serveClockWasRunning));
  }

  function handleDismissTimeout() {
    executeClockCommands(onTimeoutEnd(serveClockWasRunning));
    timeoutTeamName = '';
  }

  function handleServeClockExpired() {
    if (rallyInProgress) return;
    restartClock('serveClock');
    serveClockExpired = true;
  }

  function handleServeViolationConfirm() {
    const receiver = scoring.server === 0 ? 1 : 0;
    addPoint(receiver as 0 | 1, { result: 'Serve Clock Violation' });
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
    trackSubstitution(outId, inId);
    if (subModalSide === 1) {
      const entry = playerTime.players[inId];
      if (entry) side1Player = entry.participantName;
    } else {
      const entry = playerTime.players[inId];
      if (entry) side2Player = entry.participantName;
    }
    subModalSide = null;
    checkPlayerTimeLimits();
  }

  function handlePenalty(side: 1 | 2) {
    const activeName = side === 1 ? side1Player : side2Player;
    const activeEntry = Object.values(playerTime.players).find(
      (p) => p.participantName === activeName && p.isOnCourt,
    );
    if (!activeEntry) return;
    stopTracking(activeEntry.participantId);
    const boxProfile = getPenaltyBoxProfile();
    const durationMs = (boxProfile?.durationSeconds ?? 120) * 1000;
    sendToBox(activeEntry.participantId, activeEntry.participantName, side, durationMs);
  }

  function handleBack() {
    window.history.back();
  }

  // ── Helpers ──

  function broadcastState() {
    const boltTimer = getClockSnapshot('boltTimer');
    const serveClock = getClockSnapshot('serveClock');
    const state = getEngineState();
    const sets = state?.score?.sets ?? [];
    const isComplete = state?.matchUpStatus === 'COMPLETED';

    sendScore({
      matchUpId,
      score: { sets },
      matchUpStatus: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
    });

    sendIntennseUpdate(buildIntennseSnapshot({
      matchUpId,
      boltScore: currentBoltScore,
      aggregateScore: currentAggregateScore,
      activePlayers: scoring.activePlayers,
      server: scoring.server,
      boltTimerRemainingMs: boltTimer?.remainingMs,
      serveClockRemainingMs: serveClock?.remainingMs,
      matchUpStatus: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
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

    // Start tracking the active players (the ones assigned to this tieMatchUp)
    const s1ActiveId = s1?.participant?.participantId;
    const s2ActiveId = s2?.participant?.participantId;
    if (s1ActiveId) startTracking(s1ActiveId);
    if (s2ActiveId) startTracking(s2ActiveId);
  }

  function checkPlayerTimeLimits() {
    for (const name of [side1Player, side2Player]) {
      if (!name) continue;
      const check = checkTimeLimit(name);
      if (check.exceeded) {
        timeWarning = { playerName: name, remainingMs: 0 };
        return;
      }
      if (check.remainingMs <= 120000) {
        timeWarning = { playerName: name, remainingMs: check.remainingMs };
        return;
      }
    }
    timeWarning = null;
  }

  // ── Layout props ──

  const layoutProps = $derived({
    side1Name,
    side2Name,
    boltLabel,
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
    boltStarted,
    onWinner: (side: Side) => handleAction('winner', side),
    onTouch: (side: Side) => handleAction('touch', side),
    onForcedError: (side: Side) => handleAction('forcedError', side),
    onUnforcedError: (side: Side) => handleAction('unforcedError', side),
    onAce: (side: Side) => handleAction('ace', side),
    onFault: (side: Side) => handleAction('fault', side),
    onUndo: () => undo(),
    onRedo: () => redo(),
    onPointStart: handlePointStart,
    onTimeout: handleTimeout,
    onSubstitute: handleSubstitute,
    onPenalty: handlePenalty,
    timeoutTeamName,
    onDismissTimeout: handleDismissTimeout,
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

  <div class="intennse-penalty-area">
    <PenaltyBoxDisplay />
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

  {#if subModalSide}
    <SubstitutionModal
      side={subModalSide}
      activePlayers={
        Object.values(playerTime.players)
          .filter((p) => p.isOnCourt && sideRoster[p.participantId] === subModalSide)
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName }))
      }
      benchPlayers={
        getBenchPlayers(subModalSide, sideRoster)
          .filter((p) => !isInBox(p.participantId))
          .map((p) => ({ participantId: p.participantId, participantName: p.participantName, gender: p.gender }))
      }
      onSubstitute={executeSubstitution}
      onClose={() => (subModalSide = null)}
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
  .intennse-penalty-area {
    display: flex;
    justify-content: center;
    padding: 0 0.5rem;
  }
  .intennse-penalty-area:empty {
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
