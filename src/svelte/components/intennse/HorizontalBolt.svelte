<script lang="ts">
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
    officialPause = false,
    boltStarted = false,
    boltComplete = false,
    boltExpired = false,
    matchComplete = false,
    currentBoltNumber = 1,
    onNextBolt,
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
    onCancelTimeout,
    onSubstitute,
    onPenalty,
    timeoutTeamName = '',
    timeoutsRemaining = { 1: 5, 2: 5 },
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
    officialPause?: boolean;
    boltStarted?: boolean;
    boltComplete?: boolean;
    boltExpired?: boolean;
    matchComplete?: boolean;
    currentBoltNumber?: number;
    onNextBolt?: () => void;
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
    onCancelTimeout?: () => void;
    onSubstitute: (side: 1 | 2) => void;
    onPenalty: (side: 1 | 2) => void;
    timeoutTeamName?: string;
    timeoutsRemaining?: { 1: number; 2: number };
    onDismissTimeout: () => void;
    onBack: () => void;
  } = $props();
</script>

<div class="intennse-horizontal">
  <!-- Top header: back button + bolt label (spans all columns) -->
  <div class="intennse-h-header">
    <button class="intennse-ctrl-btn intennse-h-back" onclick={onBack} title="Back to Arc">← Arc</button>
    <span class="intennse-bolt-label">{boltLabel}</span>
  </div>

  <!-- Left side: Side 1 player + actions + penalty box -->
  <div class="intennse-h-side intennse-h-side--left">
    <PlayerPanel playerName={side1Player} teamName={side1Name} courtTimeRemainingMs={side1CourtTimeMs} isServing={server === 0} {serveSide} side={1} />
    <ActionPanel
      side={0}
      isServing={server === 0}
      disabled={!boltStarted || boltComplete}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Center column -->
  <div class="intennse-h-center">
    <ClockDisplay clockId="boltTimer" label="BOLT" size="xlarge" urgentAt={60000} criticalAt={30000} />
    <ScoreDisplay
      side1Score={boltScore.side1}
      side2Score={boltScore.side2}
      {server}
    />
    <div class="intennse-arc-compact intennse-arc-compact--large">
      <div class="intennse-arc-compact-label">ARC</div>
      <div class="intennse-arc-compact-score">
        <span class:intennse-arc-leading={aggregateScore.side1 > aggregateScore.side2}>{aggregateScore.side1}</span>
        <span class="intennse-arc-compact-divider">–</span>
        <span class:intennse-arc-leading={aggregateScore.side2 > aggregateScore.side1}>{aggregateScore.side2}</span>
      </div>
    </div>
    <ControlBar
      serveClock={true}
      {canUndo} {canRedo} {rallyInProgress} {officialPause} {boltStarted} {boltComplete} {matchComplete} {currentBoltNumber}
      {onUndo} {onRedo} {onPointStart} {onNextBolt} {timeoutTeamName} {onDismissTimeout} {onCancelTimeout}
    />
  </div>

  <!-- Right side: Side 2 player + actions + penalty box -->
  <div class="intennse-h-side intennse-h-side--right">
    <PlayerPanel playerName={side2Player} teamName={side2Name} courtTimeRemainingMs={side2CourtTimeMs} isServing={server === 1} {serveSide} side={2} />
    <ActionPanel
      side={1}
      isServing={server === 1}
      disabled={!boltStarted || boltComplete}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
    />
  </div>

  <!-- Footer: Sub / Timeout / Penalty under respective columns -->
  <div class="intennse-h-footer">
    <div class="intennse-h-footer-col">
      <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(1)} disabled={!boltStarted} title="Substitution Side 1">
        <span class="footer-label-full">Substitution</span><span class="footer-label-short">SUB</span>
      </button>
      <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(1)} disabled={!boltStarted || timeoutsRemaining[1] <= 0} title="Timeout Side 1">
        <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[1]})
      </button>
      <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(1)} disabled={!boltStarted} title="Penalty Side 1">
        <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span>
      </button>
    </div>
    <div class="intennse-h-footer-col"></div>
    <div class="intennse-h-footer-col">
      <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(2)} disabled={!boltStarted} title="Substitution Side 2">
        <span class="footer-label-full">Substitution</span><span class="footer-label-short">SUB</span>
      </button>
      <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(2)} disabled={!boltStarted || timeoutsRemaining[2] <= 0} title="Timeout Side 2">
        <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[2]})
      </button>
      <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(2)} disabled={!boltStarted} title="Penalty Side 2">
        <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span>
      </button>
    </div>
  </div>
</div>
