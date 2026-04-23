<script lang="ts">
  import PenaltyBoxIndicator from './PenaltyBoxIndicator.svelte';
  import PlayerTimeInfoPanel from './PlayerTimeInfoPanel.svelte';
  import ClockDisplay from './ClockDisplay.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import PointHistoryStream from './PointHistoryStream.svelte';
  import { isTimeoutButtonDisabled } from './boltControls';
  import { getClockSnapshot } from '../../../clock';
  import type { PlayerSlot } from './PlayerPanel.svelte';

  let {
    side1Name = '',
    side2Name = '',
    boltLabel = '',
    categoryLabel = '',
    boltScore,
    aggregateScore,
    server,
    serveSide,
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
    onSelectPlayers,
    selectionRequired = false,
    timeoutTeamName = '',
    timeoutsRemaining = { 1: 5, 2: 5 },
    onDismissTimeout,
    onChallenge,
    challengesRemaining = { 1: 1, 2: 1 },
    playerTimePanelOpen = false,
    sideRoster = {},
    breakActive = false,
    breakPaused = false,
    playerTimeSide = null,
    onTogglePlayerTimeSide,
    isLastBoltBreak = false,
    onPauseBreak,
    onStartNextBolt,
    onAwardBreakPoints,
    onBack,
    onPenaltyBoxTap,
    sidesSwapped = false,
    showForcedError = false,
    onReceiverRallyStart,
    rallyCount = 0,
    decidingPoint = false,
    showArcResult = false,
    arcWinnerName = '',
    canSubmitScore = false,
    scoreSubmitting = false,
    onSubmitScore,
    historyPoints = [],
    historyEntries,
    participantNames,
    onHistoryEntryTap,
    onDeleteChallengeEntry,
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
    playerTimeSide?: 1 | 2 | null;
    onTogglePlayerTimeSide?: (side: 1 | 2) => void;
    isLastBoltBreak?: boolean;
    onPauseBreak?: () => void;
    onStartNextBolt?: () => void;
    onAwardBreakPoints?: (side: 1 | 2, points: number) => void;
    onBack: () => void;
    onPenaltyBoxTap?: () => void;
    sidesSwapped?: boolean;
    showForcedError?: boolean;
    onReceiverRallyStart?: () => void;
    rallyCount?: number;
    decidingPoint?: boolean;
    showArcResult?: boolean;
    arcWinnerName?: string;
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
  } = $props();

  /** Portrait history-stream drawer toggle — hidden by default. */
  let showPointHistory = $state(false);

  /** Compact per-side action menu — replaces the 4-row footer grid. */
  let actionMenuSide = $state<1 | 2 | null>(null);

  /** Compact player label per side: last names joined for doubles, full name for singles. */
  function compactSideLabel(players: PlayerSlot[]): string {
    if (players.length === 0) return 'TAP TO SELECT';
    if (players.length === 1) return players[0].participantName;
    return players.map((p) => p.lastName).join(' / ');
  }
  const side1Label = $derived(compactSideLabel(side1Players));
  const side2Label = $derived(compactSideLabel(side2Players));

  /** Score-pop animation: a brief scale+glow when the score digit changes. */
  let side1Pop = $state(false);
  let side2Pop = $state(false);
  // svelte-ignore state_referenced_locally — intentional: these are
  // non-reactive previous-value trackers; the $effect below reads the
  // live prop and compares against the stale snapshot.
  let prevSide1Score = aggregateScore.side1;
  // svelte-ignore state_referenced_locally
  let prevSide2Score = aggregateScore.side2;

  $effect(() => {
    if (aggregateScore.side1 !== prevSide1Score) {
      prevSide1Score = aggregateScore.side1;
      side1Pop = true;
      setTimeout(() => (side1Pop = false), 400);
    }
    if (aggregateScore.side2 !== prevSide2Score) {
      prevSide2Score = aggregateScore.side2;
      side2Pop = true;
      setTimeout(() => (side2Pop = false), 400);
    }
  });

  const timeoutSnapshot = $derived(getClockSnapshot('timeoutTimer'));
  const timeoutActive = $derived(timeoutSnapshot?.state === 'running');
</script>

{#if timeoutActive}
  <div class="intennse-timeout-overlay">
    <div class="intennse-timeout-panel">
      <div class="intennse-timeout-label">TIMEOUT</div>
      {#if timeoutTeamName}
        <div class="intennse-timeout-team">{timeoutTeamName}</div>
      {/if}
      <ClockDisplay clockId="timeoutTimer" label="" urgentAtMs={30000} criticalAtMs={10000} />
      <div class="intennse-timeout-sub-row">
        <button class="intennse-ctrl-btn intennse-timeout-sub" onclick={() => onSubstitute(1)}>
          Sub {side1Name || 'Side 1'}
        </button>
        <button class="intennse-ctrl-btn intennse-timeout-sub" onclick={() => onSubstitute(2)}>
          Sub {side2Name || 'Side 2'}
        </button>
      </div>
      <button class="intennse-ctrl-btn intennse-timeout-dismiss" onclick={onDismissTimeout}>
        END TIMEOUT
      </button>
      {#if onCancelTimeout}
        <button class="intennse-ctrl-btn intennse-timeout-cancel" onclick={onCancelTimeout}>
          CANCEL (doesn't count)
        </button>
      {/if}
    </div>
  </div>
{/if}

<div class="intennse-vertical">
  <!-- Top: Clocks + Bolt label -->
  <div class="iv-header">
    <button class="intennse-ctrl-btn intennse-ctrl-btn--back-v" onclick={onBack}>←</button>
    {#if breakActive}
      <ClockDisplay clockId="breakTimer" label="BREAK" size="compact" urgentAt={30000} criticalAt={10000} />
      <span class="iv-bolt-label iv-bolt-label--break">
        {breakPaused ? 'PAUSED' : isLastBoltBreak ? 'Next match starting...' : 'Next bolt starting...'}
      </span>
      {#if breakPaused}
        <button class="intennse-ctrl-btn intennse-ctrl-btn--break-start" onclick={onStartNextBolt}>
          ▶ BOLT {currentBoltNumber}
        </button>
      {:else}
        <button class="intennse-ctrl-btn" onclick={onPauseBreak}>⏸</button>
      {/if}
    {:else}
      <ClockDisplay clockId="boltTimer" label="BOLT" size="compact" urgentAt={60000} criticalAt={30000} />
      <span class="iv-bolt-label">{boltLabel}</span>
      <span class="iv-serve-side">{serveSide === 'AD' ? 'AD' : serveSide ? 'DEUCE' : ''}</span>
      <button
        class="intennse-ctrl-btn iv-history-toggle"
        class:iv-history-toggle--active={showPointHistory}
        onclick={() => (showPointHistory = !showPointHistory)}
        title={showPointHistory ? 'Hide point history' : 'Show point history'}
        aria-label="Toggle point history"
        aria-pressed={showPointHistory}
      >
        ≡
      </button>
      <ClockDisplay clockId="serveClock" label="SERVE" size="compact" urgentAt={5000} criticalAt={3000} />
    {/if}
  </div>

  {#if showPointHistory && !breakActive}
    <div class="iv-history-drawer">
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

  <!-- Score display -->
  <div class="iv-score">
    <div
      class="iv-score-side"
      class:iv-score-side--needs-select={!boltStarted && side1Players.length === 0}
    >
      <span class="iv-team-name">{side1Name}</span>
      <span class="iv-score-value" class:iv-score-value--pop={side1Pop}>{aggregateScore.side1}</span>
      <span class="iv-player-name" class:iv-player-name--serving={server === 0}>{side1Label}</span>
    </div>

    <div class="iv-score-divider">—</div>

    <div
      class="iv-score-side"
      class:iv-score-side--needs-select={!boltStarted && side2Players.length === 0}
    >
      <span class="iv-team-name">{side2Name}</span>
      <span class="iv-score-value" class:iv-score-value--pop={side2Pop}>{aggregateScore.side2}</span>
      <span class="iv-player-name" class:iv-player-name--serving={server === 1}>{side2Label}</span>
    </div>
  </div>

  {#if !boltStarted && (side1Players.length === 0 || side2Players.length === 0)}
    <div class="iv-select-row">
      <button class="iv-select-btn" onclick={() => onSelectPlayers?.(1)} disabled={side1Players.length > 0 && !onSelectPlayers}>
        {side1Players.length === 0 ? `Select ${side1Name || 'side 1'} players` : `Edit ${side1Name || 'side 1'}`}
      </button>
      <button class="iv-select-btn" onclick={() => onSelectPlayers?.(2)} disabled={side2Players.length > 0 && !onSelectPlayers}>
        {side2Players.length === 0 ? `Select ${side2Name || 'side 2'} players` : `Edit ${side2Name || 'side 2'}`}
      </button>
    </div>
  {/if}

  <!-- Compact ARC score with penalty indicators flush left/right -->
  <div class="iv-arc-row">
    <PenaltyBoxIndicator sideNumber={sidesSwapped ? 2 : 1} onTap={onPenaltyBoxTap} />
    <div class="intennse-arc-compact iv-arc-wrapper">
      <div class="intennse-arc-compact-label">BOLT</div>
      <div class="intennse-arc-compact-score">
        <span class:intennse-arc-leading={boltScore.side1 > boltScore.side2}>{boltScore.side1}</span>
        <span class="intennse-arc-compact-divider">–</span>
        <span class:intennse-arc-leading={boltScore.side2 > boltScore.side1}>{boltScore.side2}</span>
      </div>
    </div>
    <PenaltyBoxIndicator sideNumber={sidesSwapped ? 1 : 2} onTap={onPenaltyBoxTap} />
  </div>

  <!-- Actions: split two-column layout, one per side -->
  <div class="iv-actions" class:iv-actions--break={breakActive}>
    {#if breakActive}
      <div class="iv-break-overlay">
        <div class="iv-break-overlay-label">BREAK</div>
        <div class="iv-break-overlay-sub">Point adjustment</div>
        <div class="iv-break-adjust">
          <button class="iv-break-adjust-btn" onclick={() => onAwardBreakPoints?.(1, 1)}>
            +1 {side1Name || 'Side 1'}
          </button>
          <button class="iv-break-adjust-btn" onclick={() => onAwardBreakPoints?.(2, 1)}>
            +1 {side2Name || 'Side 2'}
          </button>
        </div>
        {#if canSubmitScore}
          <button
            class="iv-submit-btn"
            onclick={onSubmitScore}
            disabled={scoreSubmitting}
          >
            {scoreSubmitting ? 'Submitting...' : 'Submit Score'}
          </button>
        {/if}
      </div>
    {:else}
      <div class="iv-actions-split">
        <ActionPanel
          side={0}
          isServing={server === 0}
          {rallyInProgress}
          {rallyCount}
          {showForcedError}
          disabled={!boltStarted || boltComplete || officialPause}
          onRallyStart={onReceiverRallyStart}
          {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
        />
        <ActionPanel
          side={1}
          isServing={server === 1}
          {rallyInProgress}
          {rallyCount}
          {showForcedError}
          disabled={!boltStarted || boltComplete || officialPause}
          onRallyStart={onReceiverRallyStart}
          {onWinner} {onTouch} {onForcedError} {onUnforcedError} {onAce} {onFault}
        />
      </div>
    {/if}
  </div>

  {#if playerTimePanelOpen && playerTimeSide}
    <PlayerTimeInfoPanel {sideRoster} activeSide={playerTimeSide} />
  {/if}

  {#if matchComplete && !breakActive && canSubmitScore}
    <div class="iv-final-submit">
      <button
        class="iv-submit-btn iv-submit-btn--final"
        onclick={onSubmitScore}
        disabled={scoreSubmitting}
      >
        {scoreSubmitting ? 'Submitting...' : 'Submit Final Score'}
      </button>
    </div>
  {/if}

  <!-- Footer: compact single-row with per-side action selectors -->
  <div class="iv-footer iv-footer--compact">
    <button
      class="iv-footer-actions-trigger"
      class:iv-footer-actions-trigger--open={actionMenuSide === 1}
      onclick={() => (actionMenuSide = actionMenuSide === 1 ? null : 1)}
      aria-label="Side 1 actions"
    >
      ⋯ 1
    </button>

    <div class="iv-footer-center">
      <button class="intennse-ctrl-btn" onclick={onUndo} disabled={!canUndo}>↩</button>
      <button
        class="intennse-ctrl-btn intennse-ctrl-btn--point-start"
        class:intennse-ctrl-btn--active={rallyInProgress && !officialPause}
        class:intennse-ctrl-btn--paused={officialPause}
        onclick={onPointStart}
        disabled={boltComplete || breakActive}
      >
        {#if matchComplete}✓{:else if !boltStarted}▶{:else if officialPause}⏸{:else if rallyInProgress}⏵{:else}⏯{/if}
      </button>
      <button class="intennse-ctrl-btn" onclick={onRedo} disabled={!canRedo}>↪</button>
    </div>

    <button
      class="iv-footer-actions-trigger"
      class:iv-footer-actions-trigger--open={actionMenuSide === 2}
      onclick={() => (actionMenuSide = actionMenuSide === 2 ? null : 2)}
      aria-label="Side 2 actions"
    >
      ⋯ 2
    </button>
  </div>

  <!-- Slide-up action sheet for per-side controls -->
  {#if actionMenuSide}
    {@const s = actionMenuSide}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="iv-action-sheet-backdrop" onclick={() => (actionMenuSide = null)}>
      <div class="iv-action-sheet" onclick={(e) => e.stopPropagation()}>
        <div class="iv-action-sheet-header">
          Side {s} actions
          <button class="iv-action-sheet-close" onclick={() => (actionMenuSide = null)}>✕</button>
        </div>
        <button
          class="iv-action-sheet-item iv-action-sheet-item--info"
          class:iv-action-sheet-item--active={playerTimeSide === s}
          onclick={() => { onTogglePlayerTimeSide?.(s); actionMenuSide = null; }}
        >
          Player Time
        </button>
        <button
          class="iv-action-sheet-item iv-action-sheet-item--sub"
          onclick={() => { onSubstitute(s); actionMenuSide = null; }}
        >
          Substitute
        </button>
        <button
          class="iv-action-sheet-item iv-action-sheet-item--timeout"
          onclick={() => { onTimeout(s); actionMenuSide = null; }}
          disabled={isTimeoutButtonDisabled({ breakActive, timeoutsRemaining: timeoutsRemaining[s] })}
        >
          Timeout ({timeoutsRemaining[s]})
        </button>
        <button
          class="iv-action-sheet-item iv-action-sheet-item--penalty"
          onclick={() => { onPenalty(s); actionMenuSide = null; }}
        >
          Penalty
        </button>
        <button
          class="iv-action-sheet-item iv-action-sheet-item--challenge"
          onclick={() => { onChallenge?.(s); actionMenuSide = null; }}
          disabled={!challengesRemaining[s]}
        >
          Challenge ({challengesRemaining[s]})
        </button>
      </div>
    </div>
  {/if}

  {#if decidingPoint}
    <div class="iv-deciding-banner">
      <div class="iv-deciding-label">DECIDING POINT</div>
      <div class="iv-deciding-sub">Aggregate tied — next point wins the ARC</div>
    </div>
  {/if}

  {#if showArcResult}
    <div class="iv-arc-result-overlay">
      <div class="iv-arc-result-card">
        <div class="iv-arc-result-title">ARC COMPLETE</div>
        <div class="iv-arc-result-winner">{arcWinnerName}</div>
        <div class="iv-arc-result-score">{aggregateScore.side1} – {aggregateScore.side2}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .intennse-vertical {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--intennse-bg);
    color: var(--intennse-text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    /* Safe-area insets are applied globally via epixodic.css's
     * .ep-safe-area rule — see the note there. */
  }

  .iv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0.5rem;
    gap: 0.5rem;
    border-bottom: 1px solid var(--intennse-accent);
  }

  .iv-bolt-label {
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--intennse-text-muted);
    text-align: center;
    flex: 1;
  }

  .iv-serve-side {
    /* Fixed width so switching between "AD" and "DEUCE" (or empty
     * before the first point) doesn't reflow the header. "DEUCE" is
     * the widest value at this font-size; 3rem covers it with a
     * small margin. */
    display: inline-block;
    width: 3rem;
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--intennse-serving, #00d4aa);
    white-space: nowrap;
    text-align: center;
  }

  .iv-score {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem;
    margin: 0.2rem;
    border-radius: 8px;
  }

  .iv-score-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0.3rem 1rem;
    color: var(--intennse-text);
  }

  .iv-team-name {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--intennse-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .iv-player-name {
    font-size: 0.6rem;
    color: var(--intennse-text-muted);
    text-transform: uppercase;
    transition: color 0.15s;
  }

  .iv-player-name--serving {
    color: var(--intennse-serving, #00d4aa);
    font-weight: 700;
  }

  .iv-score-value {
    font-size: 2.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    transition: transform 0.1s ease-out;
  }

  .iv-score-value--pop {
    animation: iv-score-pop 0.35s ease-out;
  }

  @keyframes iv-score-pop {
    0% { transform: scale(1); color: var(--intennse-text); }
    30% { transform: scale(1.35); color: var(--intennse-serving, #00d4aa); }
    100% { transform: scale(1); color: var(--intennse-text); }
  }

  .iv-score-divider {
    font-size: 1.2rem;
    color: var(--intennse-text-muted);
  }

  .iv-arc-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
    gap: 0.4rem;
    padding: 0 0.3rem 0.4rem;
  }

  .iv-arc-row > :first-child {
    justify-self: start;
  }

  .iv-arc-row > :last-child {
    justify-self: end;
  }

  .iv-arc-row :global(.pbi) {
    height: 100%;
    border-radius: 0;
  }

  .iv-actions--break {
    justify-content: center;
    align-items: center;
  }

  .iv-break-overlay {
    text-align: center;
    padding: 2rem 1rem;
  }

  .iv-break-overlay-label {
    font-size: 2rem;
    font-weight: 800;
    color: var(--intennse-urgent, #ff9800);
    letter-spacing: 0.2em;
  }

  .iv-break-overlay-sub {
    font-size: 0.7rem;
    color: var(--intennse-text-muted);
    margin-top: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .iv-break-adjust {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .iv-break-adjust-btn {
    flex: 1;
    padding: 0.6rem 0.5rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .iv-break-adjust-btn:active { opacity: 0.7; }

  .iv-submit-btn {
    width: 100%;
    padding: 0.6rem;
    border: none;
    border-radius: 8px;
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    margin-top: 0.5rem;
  }
  .iv-submit-btn:active { opacity: 0.7; }
  .iv-submit-btn:disabled { opacity: 0.4; cursor: default; }
  .iv-final-submit {
    padding: 0.4rem 1rem;
  }

  .iv-actions {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 0.5rem;
    /* Do NOT scroll this region — on short phones the outcome buttons must
     * shrink to fit, not spill into a scroll container. */
    overflow: hidden;
    min-height: 0;
  }

  .iv-actions-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    flex: 1 1 0;
    min-height: 0;
    height: 100%;
  }

  .iv-actions-split :global(.intennse-action-panel) {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-height: 0;
    height: 100%;
  }

  .iv-actions-split :global(.intennse-btn) {
    /* Equal share of the available column height — allow shrinking below
     * the 44px touch-target minimum on very short viewports rather than
     * introducing a scrollbar. */
    flex: 1 1 0;
    min-height: 0;
  }

  .iv-actions-split :global(.intennse-btn-label) {
    /* Keep long labels from forcing button height to grow. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .iv-bolt-label--break {
    color: var(--intennse-urgent, #ff9800);
    font-weight: 700;
  }

  .intennse-ctrl-btn--break-start {
    background: var(--intennse-winner, #00d4aa);
    color: #000;
    font-size: 0.6rem;
    font-weight: 700;
  }

  .intennse-ctrl-btn--back-v {
    font-size: 0.7rem;
    min-width: 28px;
    min-height: 28px;
    padding: 0.2rem;
  }

  .iv-history-toggle {
    font-size: 0.85rem;
    min-width: 28px;
    min-height: 28px;
    padding: 0.2rem;
    line-height: 1;
  }
  .iv-history-toggle--active {
    background: var(--intennse-accent, #0f3460);
    border-color: var(--intennse-serving, #00d4aa);
    color: var(--intennse-serving, #00d4aa);
  }

  /* Point-history drawer — slides under the header and above iv-score.
   * Constrained in height so the score/action-panel flex layout still
   * has room; the internal list scrolls. */
  .iv-history-drawer {
    /* Take available flex space between the header and the score/actions,
     * capped at 35vh so it doesn't swallow the whole screen. The child
     * PointHistoryStream handles its own internal scrolling. */
    flex: 1 1 0;
    max-height: 35vh;
    min-height: 6rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--intennse-accent);
    display: flex;
    overflow: visible;
  }
  /* The drawer renders <PointHistoryStream> (a child component) as its
   * only child, so this selector targets that child's root element.
   * `:global` is required because Svelte's scoped-CSS analyzer can't
   * match a descendant living inside another component. */
  .iv-history-drawer > :global(*) { flex: 1; min-height: 0; }

  .iv-footer {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.3rem;
    padding: 0.4rem;
    border-top: 1px solid var(--intennse-accent);
    background: var(--intennse-surface);
  }

  /* Compact single-row footer: [⋯ 1] [↩ ▶ ↪] [⋯ 2] */
  .iv-footer--compact {
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }

  .iv-footer-actions-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    min-height: 2.5rem;
    letter-spacing: 0.15em;
  }
  .iv-footer-actions-trigger:active { opacity: 0.7; transform: scale(0.97); }
  .iv-footer-actions-trigger--open {
    border-color: var(--intennse-serving, #00d4aa);
    color: var(--intennse-serving, #00d4aa);
  }

  .iv-footer-center {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.3rem;
  }

  .iv-footer :global(.intennse-ctrl-btn) {
    min-height: 2.2rem;
    font-size: 1.1rem;
  }

  /* ── Side action sheet (slide-up from bottom) ────────────── */
  .iv-action-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1500;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .iv-action-sheet {
    width: 100%;
    max-width: 400px;
    background: var(--intennse-surface, #16213e);
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    padding: 0.75rem 1rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    animation: iv-sheet-slide-up 0.15s ease-out;
  }

  @keyframes iv-sheet-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .iv-action-sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.2rem;
  }

  .iv-action-sheet-close {
    background: none;
    border: none;
    color: var(--intennse-text-muted, #8892b0);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .iv-action-sheet-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 10px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .iv-action-sheet-item:active { opacity: 0.7; transform: scale(0.98); }
  .iv-action-sheet-item:disabled { opacity: 0.3; cursor: default; }

  .iv-action-sheet-item--info { border-color: var(--intennse-text-muted, #8892b0); color: var(--intennse-text-muted); }
  .iv-action-sheet-item--active { border-color: var(--intennse-serving, #00d4aa); color: var(--intennse-serving); }
  .iv-action-sheet-item--sub { border-color: var(--intennse-touch, #4fc3f7); color: var(--intennse-touch); }
  .iv-action-sheet-item--timeout { border-color: var(--intennse-ace, #ffd740); color: var(--intennse-ace); }
  .iv-action-sheet-item--penalty { border-color: var(--intennse-error, #ef5350); color: var(--intennse-error); }
  .iv-action-sheet-item--challenge { border-color: var(--intennse-winner, #ff6b35); color: var(--intennse-winner, #ff6b35); }

  .iv-score-side--needs-select .iv-player-name {
    color: var(--intennse-urgent, #ff9800);
    font-weight: 700;
  }

  .iv-select-row {
    display: flex;
    gap: 0.4rem;
    padding: 0 0.5rem 0.4rem;
  }

  .iv-select-btn {
    flex: 1;
    padding: 0.55rem 0.5rem;
    border: 1px dashed var(--intennse-urgent, #ff9800);
    border-radius: 8px;
    background: transparent;
    color: var(--intennse-urgent, #ff9800);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    touch-action: manipulation;
  }
  .iv-select-btn:active { opacity: 0.7; }
  .iv-select-btn:disabled { opacity: 0.4; cursor: default; }

  /* ── Deciding Point Banner ── */
  .iv-deciding-banner {
    position: absolute;
    top: 3.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--intennse-ace, #ffd740);
    color: var(--intennse-surface, #16213e);
    padding: 0.5rem 1.5rem;
    border-radius: 8px;
    text-align: center;
    z-index: 20;
    box-shadow: 0 4px 20px rgba(255, 215, 64, 0.4);
  }
  .iv-deciding-label {
    font-size: 1.1rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .iv-deciding-sub {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.8;
    margin-top: 0.15rem;
  }

  /* ── ARC Result Overlay ── */
  .iv-arc-result-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    z-index: 50;
  }
  .iv-arc-result-card {
    text-align: center;
    padding: 2rem 3rem;
    border-radius: 16px;
    background: var(--intennse-surface, #16213e);
    border: 2px solid var(--intennse-serving, #00d4aa);
    box-shadow: 0 0 40px rgba(0, 212, 170, 0.3);
  }
  .iv-arc-result-title {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.5rem;
  }
  .iv-arc-result-winner {
    font-size: 1.8rem;
    font-weight: 800;
    color: var(--intennse-serving, #00d4aa);
    margin-bottom: 0.3rem;
  }
  .iv-arc-result-score {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--intennse-text, #e0e0e0);
    font-variant-numeric: tabular-nums;
  }
</style>
