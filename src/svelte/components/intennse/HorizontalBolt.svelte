<script lang="ts">
  import AggregateBar from './AggregateBar.svelte';
  import ClockDisplay from './ClockDisplay.svelte';
  import ScoreDisplay from './ScoreDisplay.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import ControlBar from './ControlBar.svelte';

  let {
    side1Name = '',
    side2Name = '',
    boltLabel = '',
    boltScore,
    aggregateScore,
    server,
    serveSide = 'DEUCE',
    canUndo,
    canRedo,
    side1Player = '',
    side2Player = '',
    side1CourtTimeMs = 0,
    side2CourtTimeMs = 0,
    rallyInProgress = false,
    boltStarted = false,
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
    timeoutTeamName = '',
    onDismissTimeout,
    onBack,
  }: {
    side1Name: string;
    side2Name: string;
    boltLabel: string;
    boltScore: { side1: number; side2: number };
    aggregateScore: { side1: number; side2: number };
    server: number;
    serveSide?: string;
    canUndo: boolean;
    canRedo: boolean;
    side1Player: string;
    side2Player: string;
    side1CourtTimeMs?: number;
    side2CourtTimeMs?: number;
    rallyInProgress?: boolean;
    boltStarted?: boolean;
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
    timeoutTeamName?: string;
    onDismissTimeout: () => void;
    onBack: () => void;
  } = $props();
</script>

<div class="intennse-horizontal">
  <!-- Top header: back button + clocks (spans all columns) -->
  <div class="intennse-h-header">
    <button class="intennse-ctrl-btn intennse-h-back" onclick={onBack} title="Back to Arc">← Arc</button>
    <ClockDisplay clockId="boltTimer" label="BOLT" size="normal" urgentAt={60000} criticalAt={30000} />
    <span class="intennse-bolt-label">{boltLabel}</span>
    <ClockDisplay clockId="serveClock" label="SERVE" size="normal" urgentAt={5000} criticalAt={3000} />
  </div>

  <!-- Left side: Side 1 player + actions -->
  <div class="intennse-h-side intennse-h-side--left">
    <PlayerPanel playerName={side1Player} teamName={side1Name} courtTimeRemainingMs={side1CourtTimeMs} isServing={server === 0} {serveSide} side={1} />
    <ActionPanel
      side={0}
      isServing={server === 0}
      disabled={!boltStarted}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Center: aggregate + score + controls -->
  <div class="intennse-h-center">
    <AggregateBar
      side1Total={aggregateScore.side1}
      side2Total={aggregateScore.side2}
      {side1Name} {side2Name}
    />
    <ScoreDisplay
      side1Score={boltScore.side1}
      side2Score={boltScore.side2}
      {side1Name} {side2Name} {server}
    />
    <ControlBar
      {canUndo} {canRedo} {rallyInProgress} {boltStarted}
      {onUndo} {onRedo} {onPointStart} {timeoutTeamName} {onDismissTimeout}
    />
  </div>

  <!-- Right side: Side 2 player + actions -->
  <div class="intennse-h-side intennse-h-side--right">
    <PlayerPanel playerName={side2Player} teamName={side2Name} courtTimeRemainingMs={side2CourtTimeMs} isServing={server === 1} {serveSide} side={2} />
    <ActionPanel
      side={1}
      isServing={server === 1}
      disabled={!boltStarted}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Footer: Sub / Timeout / Penalty under respective columns -->
  <div class="intennse-h-footer">
    <div class="intennse-h-footer-col">
      <button class="intennse-footer-btn" onclick={() => onSubstitute(1)} title="Sub Side 1">SUB</button>
      <button class="intennse-footer-btn" onclick={() => onTimeout(1)} title="Timeout Side 1">TO</button>
      <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(1)} title="Penalty Side 1">PEN</button>
    </div>
    <div class="intennse-h-footer-col">
      <button class="intennse-footer-btn" onclick={onUndo} disabled={!canUndo} title="Undo">↩</button>
      <button class="intennse-footer-btn" onclick={onRedo} disabled={!canRedo} title="Redo">↪</button>
    </div>
    <div class="intennse-h-footer-col">
      <button class="intennse-footer-btn" onclick={() => onSubstitute(2)} title="Sub Side 2">SUB</button>
      <button class="intennse-footer-btn" onclick={() => onTimeout(2)} title="Timeout Side 2">TO</button>
      <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(2)} title="Penalty Side 2">PEN</button>
    </div>
  </div>
</div>
