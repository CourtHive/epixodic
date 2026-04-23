<script lang="ts">
  import PenaltyBoxIndicator from './PenaltyBoxIndicator.svelte';
  import PlayerTimeInfoPanel from './PlayerTimeInfoPanel.svelte';
  import ClockDisplay from './ClockDisplay.svelte';
  import ScoreDisplay from './ScoreDisplay.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import PlayerPanel, { type PlayerSlot } from './PlayerPanel.svelte';
  import ControlBar from './ControlBar.svelte';
  import PointHistoryStream from './PointHistoryStream.svelte';
  import { isTimeoutButtonDisabled } from './boltControls';

  let {
    side1Name = '',
    side2Name = '',
    boltLabel = '',
    categoryLabel = '',
    boltScore,
    aggregateScore,
    server,
    serveSide = 'DEUCE',
    canUndo,
    canRedo,
    side1Players = [],
    side2Players = [],
    rallyInProgress = false,
    officialPause = false,
    boltStarted = false,
    boltComplete = false,
    boltExpired = false,
    matchComplete = false,
    decidingPoint = false,
    showArcResult = false,
    arcWinnerName = '',
    currentBoltNumber = 1,
    onNextBolt,
    onWinner,
    onTouch,
    onForcedError,
    onUnforcedError,
    onAce,
    onFault,
    onReceiverRallyStart,
    rallyCount = 0,
    onUndo,
    onRedo,
    onPointStart,
    onTimeout,
    onCancelTimeout,
    onSubstitute,
    onPenalty,
    onSelectPlayers,
    selectionRequired = false,
    timeoutTeamName = '',
    timeoutsRemaining = { 1: 5, 2: 5 },
    onDismissTimeout,
    onChallenge,
    challengesRemaining = { 1: 1, 2: 1 },
    playerTimePanelOpen = false,
    sideRoster = {},
    playerTimeSide = null,
    onTogglePlayerTimeSide,
    breakActive = false,
    breakPaused = false,
    isLastBoltBreak = false,
    onPauseBreak,
    onStartNextBolt,
    onBack,
    onPenaltyBoxTap,
    showForcedError = true,
    canSubmitScore = false,
    scoreSubmitting = false,
    onSubmitScore,
    historyPoints = [],
    historyEntries,
    participantNames,
    onHistoryEntryTap,
    onDeleteChallengeEntry,
    sidesSwapped = false,
    compactFooter = false,
  }: {
    side1Name: string;
    side2Name: string;
    boltLabel: string;
    categoryLabel?: string;
    boltScore: { side1: number; side2: number };
    aggregateScore: { side1: number; side2: number };
    server: number;
    serveSide?: string;
    canUndo: boolean;
    canRedo: boolean;
    side1Players?: PlayerSlot[];
    side2Players?: PlayerSlot[];
    rallyInProgress?: boolean;
    officialPause?: boolean;
    boltStarted?: boolean;
    boltComplete?: boolean;
    boltExpired?: boolean;
    matchComplete?: boolean;
    decidingPoint?: boolean;
    showArcResult?: boolean;
    arcWinnerName?: string;
    currentBoltNumber?: number;
    onNextBolt?: () => void;
    onWinner: (side: 0 | 1) => void;
    onTouch: (side: 0 | 1) => void;
    onForcedError: (side: 0 | 1) => void;
    onUnforcedError: (side: 0 | 1) => void;
    onAce: (side: 0 | 1) => void;
    onFault: (side: 0 | 1) => void;
    onReceiverRallyStart?: () => void;
    rallyCount?: number;
    onUndo: () => void;
    onRedo: () => void;
    onPointStart: () => void;
    onTimeout: (side: 1 | 2) => void;
    onCancelTimeout?: () => void;
    onSubstitute: (side: 1 | 2) => void;
    onPenalty: (side: 1 | 2) => void;
    onSelectPlayers?: (side: 1 | 2) => void;
    selectionRequired?: boolean;
    timeoutTeamName?: string;
    timeoutsRemaining?: { 1: number; 2: number };
    onDismissTimeout: () => void;
    onChallenge?: (side: 1 | 2) => void;
    challengesRemaining?: { 1: number; 2: number };
    playerTimePanelOpen?: boolean;
    sideRoster?: Record<string, 1 | 2>;
    playerTimeSide?: 1 | 2 | null;
    onTogglePlayerTimeSide?: (side: 1 | 2) => void;
    breakActive?: boolean;
    breakPaused?: boolean;
    isLastBoltBreak?: boolean;
    onPauseBreak?: () => void;
    onStartNextBolt?: () => void;
    onBack: () => void;
    onPenaltyBoxTap?: () => void;
    showForcedError?: boolean;
    canSubmitScore?: boolean;
    scoreSubmitting?: boolean;
    onSubmitScore?: () => void;
    /** Reactive `engine.history.points` for the current tieMatchUp. */
    historyPoints?: any[];
    /** Reactive `engine.history.entries` — interleaves subs + bolt boundaries. */
    historyEntries?: any[];
    /** participantId → name for substitution display. */
    participantNames?: Record<string, string>;
    /** Phase 3: open the point-detail modal for a history row. */
    onHistoryEntryTap?: (entry: import('./historyStream').PointHistoryEntry) => void;
    onDeleteChallengeEntry?: (entry: import('./historyStream').PointHistoryEntry) => void;
    /** When true, penalty box indicators show flipped side numbers. */
    sidesSwapped?: boolean;
    /** When true, collapses the footer to [⋯ 1] [⋯ 2] action-sheet triggers (phone landscape). */
    compactFooter?: boolean;
  } = $props();

  /** Compact per-side action menu for phone landscape. */
  let actionMenuSide = $state<1 | 2 | null>(null);
</script>

<div class="intennse-horizontal">
  <!-- Top header: back button + clocks + bolt label (spans all columns) -->
  <div class="intennse-h-header" class:intennse-h-header--clocks={compactFooter}>
    <button class="intennse-ctrl-btn intennse-h-back" onclick={onBack} title="Back to Arc">← Arc</button>
    {#if compactFooter}
      {#if breakActive}
        <ClockDisplay clockId="breakTimer" label="BREAK" size="compact" urgentAt={30000} criticalAt={10000} />
      {:else}
        <ClockDisplay clockId="boltTimer" label="BOLT" size="compact" urgentAt={60000} criticalAt={30000} />
      {/if}
    {/if}
    <span class="intennse-bolt-label" class:intennse-bolt-label--grow={compactFooter}>{boltLabel}</span>
    <span class="intennse-h-serve-side">{serveSide === 'AD' ? 'AD' : serveSide ? 'DEUCE' : ''}</span>
    {#if compactFooter && !breakActive}
      <ClockDisplay clockId="serveClock" label="SERVE" size="compact" urgentAt={5000} criticalAt={3000} />
    {/if}
  </div>

  <!-- Left side: Side 1 player + actions + penalty box -->
  <div class="intennse-h-side intennse-h-side--left">
    <PlayerPanel
      players={side1Players}
      teamName={side1Name}
      isServingTeam={server === 0}
      {serveSide}
      side={1}
      onSelect={!boltStarted ? () => onSelectPlayers?.(1) : undefined}
    />
    <ActionPanel
      side={0}
      isServing={server === 0}
      {rallyInProgress}
      {rallyCount}
      disabled={!boltStarted || boltComplete || officialPause}
      onRallyStart={onReceiverRallyStart}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault} {showForcedError}
    />
  </div>

  <!-- Center column -->
  <div class="intennse-h-center">
    {#if !compactFooter}
      {#if breakActive}
        <ClockDisplay clockId="breakTimer" label="BREAK" size="xlarge" urgentAt={30000} criticalAt={10000} />
      {:else}
        <ClockDisplay clockId="boltTimer" label={categoryLabel || 'BOLT'} size="xlarge" urgentAt={60000} criticalAt={30000} />
      {/if}
    {/if}
    <ScoreDisplay
      side1Score={aggregateScore.side1}
      side2Score={aggregateScore.side2}
      {server}
    />
    <div class="intennse-h-arc-row">
      <PenaltyBoxIndicator sideNumber={sidesSwapped ? 2 : 1} onTap={onPenaltyBoxTap} />
      <div class="intennse-arc-compact intennse-arc-compact--large">
        <div class="intennse-arc-compact-label">BOLT</div>
        <div class="intennse-arc-compact-score">
          <span class:intennse-arc-leading={boltScore.side1 > boltScore.side2}>{boltScore.side1}</span>
          <span class="intennse-arc-compact-divider">–</span>
          <span class:intennse-arc-leading={boltScore.side2 > boltScore.side1}>{boltScore.side2}</span>
        </div>
      </div>
      <PenaltyBoxIndicator sideNumber={sidesSwapped ? 1 : 2} onTap={onPenaltyBoxTap} />
    </div>
    {#if playerTimePanelOpen && playerTimeSide}
      <div class="intennse-h-center-info">
        <PlayerTimeInfoPanel {sideRoster} activeSide={playerTimeSide} />
      </div>
    {:else if historyPoints.length > 0}
      <div class="intennse-h-center-history">
        <PointHistoryStream
          points={historyPoints}
          entries={historyEntries}
          {participantNames}
          {side1Name}
          {side2Name}
          onEntryTap={onHistoryEntryTap}
          {onDeleteChallengeEntry}
        />
      </div>
    {/if}
    {#if !compactFooter}
      <ControlBar
        serveClock={!breakActive}
        hidePlayPause
        {canUndo} {canRedo} {rallyInProgress} {officialPause} {boltStarted} {boltComplete} {matchComplete} {currentBoltNumber}
        {breakActive} {breakPaused} {isLastBoltBreak} {onPauseBreak} {onStartNextBolt}
        {onUndo} {onRedo} {onPointStart} {onNextBolt} {timeoutTeamName} {onDismissTimeout} {onCancelTimeout}
        {side1Name} {side2Name}
        onTimeoutSubstitute={onSubstitute}
      />
    {/if}
    {#if canSubmitScore && (breakActive || (matchComplete && !breakActive))}
      <button
        class="ih-submit-btn"
        onclick={onSubmitScore}
        disabled={scoreSubmitting}
      >
        {scoreSubmitting ? 'Submitting...' : matchComplete && !breakActive ? 'Submit Final Score' : 'Submit Score'}
      </button>
    {/if}
  </div>

  <!-- Right side: Side 2 player + actions + penalty box -->
  <div class="intennse-h-side intennse-h-side--right">
    <PlayerPanel
      players={side2Players}
      teamName={side2Name}
      isServingTeam={server === 1}
      {serveSide}
      side={2}
      onSelect={!boltStarted ? () => onSelectPlayers?.(2) : undefined}
    />
    <ActionPanel
      side={1}
      isServing={server === 1}
      {rallyInProgress}
      {rallyCount}
      disabled={!boltStarted || boltComplete || officialPause}
      onRallyStart={onReceiverRallyStart}
      {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault} {showForcedError}
    />
  </div>

  {#if compactFooter}
    <!-- Phone landscape: compact footer with per-side action sheets -->
    <div class="intennse-h-footer intennse-h-footer--compact">
      <button
        class="ih-actions-trigger"
        class:ih-actions-trigger--open={actionMenuSide === 1}
        onclick={() => (actionMenuSide = actionMenuSide === 1 ? null : 1)}
        aria-label="Side 1 actions"
      >
        ⋯ 1
      </button>
      <div class="ih-compact-center">
        <button class="intennse-ctrl-btn intennse-ctrl-btn--undo-redo" onclick={onUndo} disabled={!canUndo}>UNDO</button>
        <button
          class="intennse-ctrl-btn intennse-ctrl-btn--point-start"
          class:intennse-ctrl-btn--active={rallyInProgress && !officialPause}
          class:intennse-ctrl-btn--paused={officialPause}
          onclick={onPointStart}
          disabled={boltComplete || breakActive}
        >
          {#if matchComplete}✓{:else if !boltStarted}▶{:else if officialPause}⏸{:else if rallyInProgress}⏵{:else}⏯{/if}
        </button>
        <button class="intennse-ctrl-btn intennse-ctrl-btn--undo-redo" onclick={onRedo} disabled={!canRedo}>REDO</button>
      </div>
      <button
        class="ih-actions-trigger"
        class:ih-actions-trigger--open={actionMenuSide === 2}
        onclick={() => (actionMenuSide = actionMenuSide === 2 ? null : 2)}
        aria-label="Side 2 actions"
      >
        ⋯ 2
      </button>
    </div>

    {#if actionMenuSide}
      {@const s = actionMenuSide}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ih-action-sheet-backdrop" onclick={() => (actionMenuSide = null)}>
        <div class="ih-action-sheet" onclick={(e) => e.stopPropagation()}>
          <div class="ih-action-sheet-header">
            Side {s} actions
            <button class="ih-action-sheet-close" onclick={() => (actionMenuSide = null)}>✕</button>
          </div>
          <button
            class="ih-action-sheet-item ih-action-sheet-item--info"
            class:ih-action-sheet-item--active={playerTimeSide === s}
            onclick={() => { onTogglePlayerTimeSide?.(s); actionMenuSide = null; }}
          >
            Player Time
          </button>
          <button
            class="ih-action-sheet-item ih-action-sheet-item--sub"
            onclick={() => { onSubstitute(s); actionMenuSide = null; }}
          >
            Substitute
          </button>
          <button
            class="ih-action-sheet-item ih-action-sheet-item--timeout"
            onclick={() => { onTimeout(s); actionMenuSide = null; }}
            disabled={isTimeoutButtonDisabled({ breakActive, timeoutsRemaining: timeoutsRemaining[s], requireBoltStarted: true, boltStarted })}
          >
            Timeout ({timeoutsRemaining[s]})
          </button>
          <button
            class="ih-action-sheet-item ih-action-sheet-item--penalty"
            onclick={() => { onPenalty(s); actionMenuSide = null; }}
          >
            Penalty
          </button>
          <button
            class="ih-action-sheet-item ih-action-sheet-item--challenge"
            onclick={() => { onChallenge?.(s); actionMenuSide = null; }}
            disabled={!challengesRemaining[s]}
          >
            Challenge ({challengesRemaining[s]})
          </button>
        </div>
      </div>
    {/if}
  {:else}
    <!-- Tablet: full 3-column footer -->
    <div class="intennse-h-footer">
      <div class="intennse-h-footer-col">
        <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(1)} disabled={!boltStarted} title="Substitution Side 1">
          <span class="footer-label-full">Substitution</span><span class="footer-label-short">SUB</span>
        </button>
        <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(1)} disabled={isTimeoutButtonDisabled({ breakActive, timeoutsRemaining: timeoutsRemaining[1], requireBoltStarted: true, boltStarted })} title="Timeout Side 1">
          <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[1]})
        </button>
        <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(1)} disabled={!boltStarted} title="Penalty Side 1">
          <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span>
        </button>
      </div>
      <div class="intennse-h-footer-col intennse-h-footer-col--center">
        <div class="intennse-h-time-row">
          <button
            class="intennse-footer-btn intennse-footer-btn--info"
            class:intennse-footer-btn--active={playerTimeSide === 1}
            onclick={() => onTogglePlayerTimeSide?.(1)}
            title="Player Time Side 1"
          >
            <span class="footer-label-full">Time</span><span class="footer-label-short">TIME</span> 1
          </button>

          {#if breakActive && breakPaused}
            <button class="intennse-footer-btn intennse-footer-btn--play" onclick={onStartNextBolt}>
              ▶ START
            </button>
          {:else if breakActive}
            <button class="intennse-footer-btn intennse-footer-btn--play" onclick={onPauseBreak}>
              ⏸ PAUSE
            </button>
          {:else}
            <button
              class="intennse-footer-btn intennse-footer-btn--play"
              class:intennse-footer-btn--active={rallyInProgress && !officialPause}
              class:intennse-footer-btn--paused={officialPause}
              onclick={onPointStart}
              disabled={boltComplete}
            >
              {#if matchComplete}✓{:else if !boltStarted}▶{:else if officialPause}▶{:else}⏸{/if}
            </button>
          {/if}

          <button
            class="intennse-footer-btn intennse-footer-btn--info"
            class:intennse-footer-btn--active={playerTimeSide === 2}
            onclick={() => onTogglePlayerTimeSide?.(2)}
            title="Player Time Side 2"
          >
            <span class="footer-label-full">Time</span><span class="footer-label-short">TIME</span> 2
          </button>
        </div>
      </div>
      <div class="intennse-h-footer-col">
        <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(2)} disabled={!boltStarted} title="Substitution Side 2">
          <span class="footer-label-full">Substitution</span><span class="footer-label-short">SUB</span>
        </button>
        <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(2)} disabled={isTimeoutButtonDisabled({ breakActive, timeoutsRemaining: timeoutsRemaining[2], requireBoltStarted: true, boltStarted })} title="Timeout Side 2">
          <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[2]})
        </button>
        <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(2)} disabled={!boltStarted} title="Penalty Side 2">
          <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span>
        </button>
      </div>
    </div>
  {/if}

  {#if decidingPoint}
    <div class="ih-deciding-banner">
      <span class="ih-deciding-label">DECIDING POINT</span>
      <span class="ih-deciding-sub">Aggregate tied — next point wins the ARC</span>
    </div>
  {/if}

  {#if showArcResult}
    <div class="ih-arc-result-overlay">
      <div class="ih-arc-result-card">
        <div class="ih-arc-result-title">ARC COMPLETE</div>
        <div class="ih-arc-result-winner">{arcWinnerName}</div>
        <div class="ih-arc-result-score">{aggregateScore.side1} – {aggregateScore.side2}</div>
      </div>
    </div>
  {/if}
</div>
