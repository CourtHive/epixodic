<script lang="ts">
  import HorizontalBolt from './HorizontalBolt.svelte';
  import VerticalBolt from './VerticalBolt.svelte';
  import SubstitutionModal from './SubstitutionModal.svelte';
  import PenaltyBoxDisplay from './PenaltyBoxDisplay.svelte';
  import PlayerTimeWarning from './PlayerTimeWarning.svelte';
  import {
    getScoringState,
    initScoringEngine,
    addPoint,
    undo,
    redo,
    setServer,
    substitute as engineSubstitute,
  } from '../../stores/scoringEngine.svelte';
  import {
    getPlayerTimeState,
    handleSubstitution as trackSubstitution,
    getRemainingMs,
    checkTimeLimit,
    getBenchPlayers,
    stopTracking,
  } from '../../stores/playerTime.svelte';
  import {
    sendToBox,
    isInBox,
  } from '../../stores/penaltyBox.svelte';
  import { getPenaltyBoxProfile, getScoringState as _getScoringState } from '../../stores/scoringEngine.svelte';
  import { buildIntennseSnapshot } from '../../../services/intennseStats';
  import { sendScore, sendIntennseUpdate } from '../../../services/messaging/scoreRelay';
  import { getClockSnapshot } from '../../../clock';
  import {
    createClock,
    destroyClock,
    restartClock,
    pauseClock,
    resumeClock,
  } from '../../../clock';
  import { browserStorage } from '../../../state/browserStorage';
  import { onMount, onDestroy } from 'svelte';

  let { matchUpId = '', boltLabel = '', side1Name = '', side2Name = '' }: {
    matchUpId: string;
    boltLabel?: string;
    side1Name?: string;
    side2Name?: string;
  } = $props();

  const scoring = getScoringState();

  let rallyInProgress = $state(false);
  let isLandscape = $state(window.innerWidth > window.innerHeight);

  function handleResize() {
    isLandscape = window.innerWidth > window.innerHeight;
  }

  // Current Bolt score: last set in progress (or zeros)
  const currentBoltScore = $derived.by(() => {
    const sets = scoring.sets;
    if (sets.length === 0) return { side1: 0, side2: 0 };
    const current = sets[sets.length - 1];
    return { side1: current.side1Score ?? 0, side2: current.side2Score ?? 0 };
  });

  const playerTime = getPlayerTimeState();

  // Active player names and court time — driven by playerTime store
  // (Players are registered in Phase 8 when loading from Arc scorecard;
  //  for now, fallback to placeholder names)
  let side1Player = $state('Player 1');
  let side2Player = $state('Player 2');
  let side1CourtTimeMs = $derived(side1Player ? getRemainingMs(side1Player) : 0);
  let side2CourtTimeMs = $derived(side2Player ? getRemainingMs(side2Player) : 0);

  // Substitution modal state
  let subModalSide = $state<1 | 2 | null>(null);
  // Placeholder side roster mapping (populated in Phase 8 from lineUp data)
  let sideRoster = $state<Record<string, 1 | 2>>({});

  // Time warning state
  let timeWarning = $state<{ playerName: string; remainingMs: number } | null>(null);

  onMount(() => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Initialize scoring engine from stored match data
    const stored = browserStorage.get(matchUpId);
    if (stored) {
      try {
        const matchData = JSON.parse(stored);
        const format = matchData.matchUpFormat || matchData.competitionFormat?.matchUpFormat || 'SET7XA-S:T10P';
        initScoringEngine({
          matchUpFormat: format,
          competitionFormat: matchData.competitionFormat,
        });
        // Extract player names from sides
        if (matchData.sides?.[0]?.participant?.participantName) {
          side1Player = matchData.sides[0].participant.participantName;
        }
        if (matchData.sides?.[1]?.participant?.participantName) {
          side2Player = matchData.sides[1].participant.participantName;
        }
      } catch {
        // Fall through to default engine init
        initScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
      }
    } else {
      initScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
    }

    // Create Bolt timer: 10 minutes countdown
    createClock({
      id: 'boltTimer',
      durationMs: 10 * 60 * 1000,
      direction: 'down',
      tickIntervalMs: 200,
      onExpire: () => {
        // Bolt time expired — current rally finishes, then endSegment
        // (handled by umpire tapping a result button after the rally)
      },
    });

    // Create serve clock: 14 seconds
    createClock({
      id: 'serveClock',
      durationMs: 14 * 1000,
      direction: 'down',
      tickIntervalMs: 100,
    });
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    destroyClock('boltTimer');
    destroyClock('serveClock');
    destroyClock('timeoutTimer');
  });

  // After each point, restart serve clock, check time limits, broadcast
  function afterPoint() {
    rallyInProgress = false;
    restartClock('serveClock');
    checkPlayerTimeLimits();
    broadcastState();
  }

  function broadcastState() {
    const boltTimer = getClockSnapshot('boltTimer');
    const serveClock = getClockSnapshot('serveClock');

    // Standard score update (compatible with non-INTENNSE displays)
    sendScore({
      matchUpId,
      score: { sets: scoring.sets },
      matchUpStatus: scoring.isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      winningSide: scoring.isComplete ? undefined : undefined,
    });

    // Enriched INTENNSE update
    sendIntennseUpdate(buildIntennseSnapshot({
      matchUpId,
      boltScore: currentBoltScore,
      aggregateScore: scoring.aggregateScore,
      activePlayers: scoring.activePlayers,
      server: scoring.server,
      boltTimerRemainingMs: boltTimer?.remainingMs,
      serveClockRemainingMs: serveClock?.remainingMs,
      matchUpStatus: scoring.isComplete ? 'COMPLETED' : 'IN_PROGRESS',
    }));
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

  function handleWinner(side: 0 | 1) {
    addPoint(side, { result: 'Winner' });
    afterPoint();
  }

  function handleTouch(side: 0 | 1) {
    // Touch = opponent touched the ball, point winner gets 1 (not 2)
    addPoint(side, { result: 'Touch' });
    afterPoint();
  }

  function handleAce(side: 0 | 1) {
    addPoint(side, { result: 'Ace' });
    afterPoint();
  }

  function handleForcedError(side: 0 | 1) {
    // Side committed a forced error → opponent wins the point
    addPoint(1 - side as 0 | 1, { result: 'Forced Error' });
    afterPoint();
  }

  function handleUnforcedError(side: 0 | 1) {
    // Side committed an unforced error → opponent wins the point
    addPoint(1 - side as 0 | 1, { result: 'Unforced Error' });
    afterPoint();
  }

  function handleFault(_side: 0 | 1) {
    // INTENNSE fault = loss of serve only, no point awarded
    // Server changes to opponent
    const opponent = (1 - scoring.server) as 0 | 1;
    setServer(opponent);
    afterPoint();
  }

  function handleUndo() {
    undo();
  }

  function handleRedo() {
    redo();
  }

  function handlePointStart() {
    if (!rallyInProgress) {
      rallyInProgress = true;
      // Stop serve clock — rally is in progress
      pauseClock('serveClock');
    }
  }

  function handleTimeout(side: 1 | 2) {
    // Pause Bolt timer, start 2-minute timeout timer
    pauseClock('boltTimer');
    createClock({
      id: 'timeoutTimer',
      durationMs: 2 * 60 * 1000,
      direction: 'down',
      autoStart: true,
      tickIntervalMs: 200,
      onExpire: () => {
        // Timeout over, resume Bolt timer
        resumeClock('boltTimer');
        destroyClock('timeoutTimer');
      },
    });
    // TODO Phase 6: track timeout count per side
    console.log(`Timeout called by side ${side}`);
  }

  function handleSubstitute(side: 1 | 2) {
    subModalSide = side;
  }

  function executeSubstitution(outId: string, inId: string) {
    if (!subModalSide) return;
    engineSubstitute(subModalSide, outId, inId);
    trackSubstitution(outId, inId);
    // Update active player name display
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
    // Find the active player on the penalized side
    const activeName = side === 1 ? side1Player : side2Player;
    const activeEntry = Object.values(playerTime.players).find(
      (p) => p.participantName === activeName && p.isOnCourt,
    );
    if (!activeEntry) return;

    // Remove from court and send to penalty box
    stopTracking(activeEntry.participantId);
    const boxProfile = getPenaltyBoxProfile();
    const durationMs = (boxProfile?.durationSeconds ?? 120) * 1000;
    sendToBox(activeEntry.participantId, activeEntry.participantName, side, durationMs);
  }

  function handleBack() {
    window.history.back();
  }

  const layoutProps = $derived({
    side1Name,
    side2Name,
    boltLabel,
    boltScore: currentBoltScore,
    aggregateScore: scoring.aggregateScore,
    server: scoring.server,
    canUndo: scoring.canUndo,
    canRedo: scoring.canRedo,
    side1Player,
    side2Player,
    side1CourtTimeMs,
    side2CourtTimeMs,
    rallyInProgress,
    onWinner: handleWinner,
    onTouch: handleTouch,
    onForcedError: handleForcedError,
    onUnforcedError: handleUnforcedError,
    onAce: handleAce,
    onFault: handleFault,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onPointStart: handlePointStart,
    onTimeout: handleTimeout,
    onSubstitute: handleSubstitute,
    onPenalty: handlePenalty,
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
</style>
