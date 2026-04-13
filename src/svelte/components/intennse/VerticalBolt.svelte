<script lang="ts">
  import PenaltyBoxIndicator from './PenaltyBoxIndicator.svelte';
  import PlayerTimeInfoPanel from './PlayerTimeInfoPanel.svelte';
  import ClockDisplay from './ClockDisplay.svelte';
  import { getClockSnapshot } from '../../../clock';
  import type { PlayerSlot } from './PlayerPanel.svelte';

  let {
    side1Name = '',
    side2Name = '',
    boltLabel = '',
    boltScore,
    aggregateScore,
    server,
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
    playerTimePanelOpen = false,
    onTogglePlayerTimePanel,
    sideRoster = {},
    breakActive = false,
    breakPaused = false,
    onPauseBreak,
    onStartNextBolt,
    onAwardBreakPoints,
    onBack,
    onPenaltyBoxTap,
  }: {
    side1Name: string;
    side2Name: string;
    boltLabel: string;
    boltScore: { side1: number; side2: number };
    aggregateScore: { side1: number; side2: number };
    server: number;
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
    playerTimePanelOpen?: boolean;
    onTogglePlayerTimePanel?: () => void;
    sideRoster?: Record<string, 1 | 2>;
    breakActive?: boolean;
    breakPaused?: boolean;
    onPauseBreak?: () => void;
    onStartNextBolt?: () => void;
    onAwardBreakPoints?: (side: 1 | 2, points: number) => void;
    onBack: () => void;
    onPenaltyBoxTap?: () => void;
  } = $props();

  /** Compact player label per side: last names joined for doubles, full name for singles. */
  function compactSideLabel(players: PlayerSlot[]): string {
    if (players.length === 0) return 'TAP TO SELECT';
    if (players.length === 1) return players[0].participantName;
    return players.map((p) => p.lastName).join(' / ');
  }
  const side1Label = $derived(compactSideLabel(side1Players));
  const side2Label = $derived(compactSideLabel(side2Players));

  const timeoutSnapshot = $derived(getClockSnapshot('timeoutTimer'));
  const timeoutActive = $derived(timeoutSnapshot?.state === 'running');

  // Side selection: each action button picks a side via the score panel tap targets
  let pendingAction = $state<string | null>(null);

  function selectSide(side: 0 | 1) {
    if (!pendingAction) return;
    const action = pendingAction;
    pendingAction = null;

    switch (action) {
      case 'winner': onWinner(side); break;
      case 'touch': onTouch(side); break;
      case 'forcedError': onForcedError(side); break;
      case 'unforcedError': onUnforcedError(side); break;
      case 'ace': onAce(side); break;
      case 'fault': onFault(side); break;
    }
  }

  function actionButton(action: string) {
    // Ace and fault are always attributed to the server — no side selection needed
    if (action === 'ace') { onAce(server as 0 | 1); return; }
    if (action === 'fault') { onFault(server as 0 | 1); return; }
    pendingAction = pendingAction === action ? null : action;
  }

  const actionLabels: Record<string, { label: string; value?: string; cls: string; color: string }> = {
    winner: { label: 'Winner', value: '2', cls: 'intennse-btn--winner', color: 'var(--intennse-winner)' },
    touch: { label: 'Touch', value: '1', cls: 'intennse-btn--touch', color: 'var(--intennse-touch)' },
    ace: { label: 'Ace', value: '2', cls: 'intennse-btn--ace', color: 'var(--intennse-winner)' },
    forcedError: { label: 'Forced', value: '1', cls: 'intennse-btn--forced', color: 'var(--intennse-error)' },
    unforcedError: { label: 'Error', value: '1', cls: 'intennse-btn--unforced', color: '#c62828' },
    fault: { label: 'Fault', cls: 'intennse-btn--fault', color: 'var(--intennse-fault)' },
  };

  const actions = $derived(
    pendingAction
      ? Object.keys(actionLabels)
      : ['winner', 'touch', 'forcedError', 'unforcedError', 'ace', 'fault'],
  );
</script>

{#if timeoutActive}
  <div class="intennse-timeout-overlay">
    <div class="intennse-timeout-panel">
      <div class="intennse-timeout-label">TIMEOUT</div>
      {#if timeoutTeamName}
        <div class="intennse-timeout-team">{timeoutTeamName}</div>
      {/if}
      <ClockDisplay clockId="timeoutTimer" label="" urgentAtMs={30000} criticalAtMs={10000} />
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
        {breakPaused ? 'PAUSED' : 'Next bolt starting...'}
      </span>
      {#if breakPaused}
        <button class="intennse-ctrl-btn intennse-ctrl-btn--break-start" onclick={onStartNextBolt}>
          ▶ BOLT {currentBoltNumber + 1}
        </button>
      {:else}
        <button class="intennse-ctrl-btn" onclick={onPauseBreak}>⏸</button>
      {/if}
    {:else}
      <ClockDisplay clockId="boltTimer" label="BOLT" size="compact" urgentAt={60000} criticalAt={30000} />
      <span class="iv-bolt-label">{boltLabel}</span>
      <ClockDisplay clockId="serveClock" label="SERVE" size="compact" urgentAt={5000} criticalAt={3000} />
    {/if}
  </div>

  <!-- Score: tap left/right to select side when action is pending -->
  <div class="iv-score" class:iv-score--selecting={!!pendingAction}>
    <button
      class="iv-score-side"
      class:iv-score-side--selectable={!!pendingAction}
      class:iv-score-side--needs-select={!boltStarted && side1Players.length === 0}
      onclick={() => selectSide(0)}
      disabled={!pendingAction}
    >
      <span class="iv-team-name">{side1Name}</span>
      <span class="iv-score-value">{boltScore.side1}</span>
      <span class="iv-player-name" class:iv-player-name--serving={server === 0}>{side1Label}</span>
    </button>

    <div class="iv-score-divider">—</div>

    <button
      class="iv-score-side"
      class:iv-score-side--selectable={!!pendingAction}
      class:iv-score-side--needs-select={!boltStarted && side2Players.length === 0}
      onclick={() => selectSide(1)}
      disabled={!pendingAction}
    >
      <span class="iv-team-name">{side2Name}</span>
      <span class="iv-score-value">{boltScore.side2}</span>
      <span class="iv-player-name" class:iv-player-name--serving={server === 1}>{side2Label}</span>
    </button>
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
    <PenaltyBoxIndicator sideNumber={1} onTap={onPenaltyBoxTap} />
    <div class="intennse-arc-compact iv-arc-wrapper">
      <div class="intennse-arc-compact-label">ARC</div>
      <div class="intennse-arc-compact-score">
        <span class:intennse-arc-leading={aggregateScore.side1 > aggregateScore.side2}>{aggregateScore.side1}</span>
        <span class="intennse-arc-compact-divider">–</span>
        <span class:intennse-arc-leading={aggregateScore.side2 > aggregateScore.side1}>{aggregateScore.side2}</span>
      </div>
      {#if pendingAction}
        <div class="iv-arc-overlay" style:color={actionLabels[pendingAction]?.color}>
          Tap a side for {actionLabels[pendingAction]?.label}
        </div>
      {/if}
    </div>
    <PenaltyBoxIndicator sideNumber={2} onTap={onPenaltyBoxTap} />
  </div>

  <!-- Actions: single column -->
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
      </div>
    {:else}
      {#each actions as action (action)}
        {@const info = actionLabels[action]}
        <button
          class="intennse-btn {info.cls}"
          class:intennse-btn--selected={pendingAction === action}
          onclick={() => actionButton(action)}
          disabled={!boltStarted || boltComplete}
        >
          <span class="intennse-btn-label">{info.label}</span>
          {#if info.value}
            <span class="intennse-btn-value">{info.value}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>

  {#if playerTimePanelOpen}
    <PlayerTimeInfoPanel {sideRoster} />
  {/if}

  <!-- Footer: TIME row + 3-column grid (side 1 | controls | side 2) -->
  <div class="iv-footer">
    <button
      class="intennse-footer-btn intennse-footer-btn--info iv-footer-time"
      class:intennse-footer-btn--active={playerTimePanelOpen}
      onclick={onTogglePlayerTimePanel}
    >
      <span class="footer-label-full">Player Time</span><span class="footer-label-short">TIME</span>
    </button>

    <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(1)}>
      <span class="footer-label-full">Sub</span><span class="footer-label-short">SUB</span> 1
    </button>
    <button class="intennse-ctrl-btn" onclick={onUndo} disabled={!canUndo}>↩</button>
    <button class="intennse-footer-btn intennse-footer-btn--sub" onclick={() => onSubstitute(2)}>
      <span class="footer-label-full">Sub</span><span class="footer-label-short">SUB</span> 2
    </button>

    <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(1)} disabled={timeoutsRemaining[1] <= 0}>
      <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[1]})
    </button>
    <button class="intennse-ctrl-btn" onclick={onRedo} disabled={!canRedo}>↪</button>
    <button class="intennse-footer-btn intennse-footer-btn--timeout" onclick={() => onTimeout(2)} disabled={timeoutsRemaining[2] <= 0}>
      <span class="footer-label-full">Timeout</span><span class="footer-label-short">TO</span> ({timeoutsRemaining[2]})
    </button>

    <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(1)}>
      <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span> 1
    </button>
    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start"
      class:intennse-ctrl-btn--active={rallyInProgress && !officialPause}
      class:intennse-ctrl-btn--paused={officialPause}
      onclick={onPointStart}
      disabled={boltComplete || breakActive}
    >
      {#if matchComplete}✓{:else if !boltStarted}▶{:else if officialPause}⏸{:else if rallyInProgress}⏵{:else}⏯{/if}
    </button>
    <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(2)}>
      <span class="footer-label-full">Penalty</span><span class="footer-label-short">PEN</span> 2
    </button>
  </div>
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

  .iv-score {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem;
    margin: 0.2rem;
    border-radius: 8px;
  }

  .iv-score--selecting {
    background: var(--intennse-accent);
  }

  .iv-score-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    background: none;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0.3rem 1rem;
    color: var(--intennse-text);
    cursor: default;
    transition: border-color 0.15s;
  }

  .iv-score-side--selectable {
    cursor: pointer;
    border-color: var(--intennse-text-muted);
  }

  .iv-score-side--selectable:active {
    background: var(--intennse-accent);
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
  }

  .iv-score-divider {
    font-size: 1.2rem;
    color: var(--intennse-text-muted);
  }

  .iv-arc-wrapper {
    position: relative;
  }

  .iv-arc-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 600;
    background: var(--intennse-bg, #1a1a2e);
    white-space: nowrap;
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

  .iv-actions {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 0.5rem;
    overflow-y: auto;
  }

  .iv-actions :global(.intennse-btn) {
    flex: 1;
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

  :global(.intennse-btn--selected) {
    outline: 2px solid var(--intennse-text);
    outline-offset: 1px;
  }

  .iv-footer {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.3rem;
    padding: 0.4rem;
    border-top: 1px solid var(--intennse-accent);
    background: var(--intennse-surface);
  }

  .iv-footer-time {
    grid-column: 1 / -1;
  }

  .iv-footer :global(.intennse-ctrl-btn) {
    min-height: 2.2rem;
    font-size: 1.1rem;
  }

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
</style>
