<script lang="ts">
  import ScoreHeader from './ScoreHeader.svelte';
  import ScoreDisplay from './ScoreDisplay.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import ControlBar from './ControlBar.svelte';
  import AggregateBar from './AggregateBar.svelte';

  let {
    side1Name = '',
    side2Name = '',
    boltLabel = '',
    boltScore,
    aggregateScore,
    server,
    canUndo,
    canRedo,
    side1Player = '',
    side2Player = '',
    side1CourtTimeMs = 0,
    side2CourtTimeMs = 0,
    rallyInProgress = false,
    onWinner,
    onTouch,
    onForcedError,
    onUnforcedError,
    onAce,
    onFault,
    onUndo,
    onRedo,
    onPointStart,
    onTimeout,
    onSubstitute,
    onPenalty,
    onBack,
  }: {
    side1Name: string;
    side2Name: string;
    boltLabel: string;
    boltScore: { side1: number; side2: number };
    aggregateScore: { side1: number; side2: number };
    server: number;
    canUndo: boolean;
    canRedo: boolean;
    side1Player: string;
    side2Player: string;
    side1CourtTimeMs?: number;
    side2CourtTimeMs?: number;
    rallyInProgress?: boolean;
    onWinner: (side: 0 | 1) => void;
    onTouch: (side: 0 | 1) => void;
    onForcedError: (side: 0 | 1) => void;
    onUnforcedError: (side: 0 | 1) => void;
    onAce: (side: 0 | 1) => void;
    onFault: (side: 0 | 1) => void;
    onUndo: () => void;
    onRedo: () => void;
    onPointStart: () => void;
    onTimeout: (side: 1 | 2) => void;
    onSubstitute: (side: 1 | 2) => void;
    onPenalty: (side: 1 | 2) => void;
    onBack: () => void;
  } = $props();
</script>

<div class="intennse-horizontal">
  <!-- Left side: Side 1 player + actions -->
  <div class="intennse-h-side intennse-h-side--left">
    <PlayerPanel playerName={side1Player} courtTimeRemainingMs={side1CourtTimeMs} isServing={server === 0} side={1} />
    <ActionPanel
      side={0}
      isServing={server === 0}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Center: Timers, score, controls -->
  <div class="intennse-h-center">
    <ScoreHeader {boltLabel} />
    <ScoreDisplay
      side1Score={boltScore.side1}
      side2Score={boltScore.side2}
      {side1Name} {side2Name} {server}
    />
    <ControlBar
      {canUndo} {canRedo} {rallyInProgress}
      {onUndo} {onRedo} {onPointStart} {onTimeout} {onSubstitute} {onPenalty} {onBack}
    />
  </div>

  <!-- Right side: Side 2 player + actions -->
  <div class="intennse-h-side intennse-h-side--right">
    <PlayerPanel playerName={side2Player} courtTimeRemainingMs={side2CourtTimeMs} isServing={server === 1} side={2} />
    <ActionPanel
      side={1}
      isServing={server === 1}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Bottom: Arc aggregate -->
  <AggregateBar
    side1Total={aggregateScore.side1}
    side2Total={aggregateScore.side2}
    {side1Name} {side2Name}
  />
</div>
