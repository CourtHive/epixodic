<script lang="ts">
  import ClockDisplay from './ClockDisplay.svelte';
  import AggregateBar from './AggregateBar.svelte';
  import { getClockSnapshot } from '../../../clock';

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
    pendingAction = pendingAction === action ? null : action;
  }

  const actionLabels: Record<string, { label: string; value?: string; cls: string }> = {
    winner: { label: 'Winner', value: '2', cls: 'intennse-btn--winner' },
    touch: { label: 'Touch', value: '1', cls: 'intennse-btn--touch' },
    ace: { label: 'Ace', value: '2', cls: 'intennse-btn--ace' },
    forcedError: { label: 'Forced', value: '1', cls: 'intennse-btn--forced' },
    unforcedError: { label: 'Error', value: '1', cls: 'intennse-btn--unforced' },
    fault: { label: 'Fault', cls: 'intennse-btn--fault' },
  };

  const actions = $derived(
    pendingAction
      ? Object.keys(actionLabels)
      : ['winner', 'touch', 'ace', 'forcedError', 'unforcedError', 'fault'],
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
    </div>
  </div>
{/if}

<div class="intennse-vertical">
  <!-- Top: Clocks + Bolt label -->
  <div class="iv-header">
    <button class="intennse-ctrl-btn intennse-ctrl-btn--back-v" onclick={onBack}>←</button>
    <ClockDisplay clockId="boltTimer" label="BOLT" size="compact" urgentAt={60000} criticalAt={30000} />
    <span class="iv-bolt-label">{boltLabel}</span>
    <ClockDisplay clockId="serveClock" label="SERVE" size="compact" urgentAt={5000} criticalAt={3000} />
  </div>

  <!-- Aggregate score above bolt score -->
  <AggregateBar
    side1Total={aggregateScore.side1}
    side2Total={aggregateScore.side2}
    {side1Name} {side2Name}
  />

  <!-- Score: tap left/right to select side when action is pending -->
  <div class="iv-score" class:iv-score--selecting={!!pendingAction}>
    <button
      class="iv-score-side"
      class:iv-score-side--serving={server === 0}
      class:iv-score-side--selectable={!!pendingAction}
      onclick={() => selectSide(0)}
      disabled={!pendingAction}
    >
      <span class="iv-player-name">{side1Player}</span>
      <span class="iv-score-value">{boltScore.side1}</span>
    </button>

    <div class="iv-score-divider">—</div>

    <button
      class="iv-score-side"
      class:iv-score-side--serving={server === 1}
      class:iv-score-side--selectable={!!pendingAction}
      onclick={() => selectSide(1)}
      disabled={!pendingAction}
    >
      <span class="iv-score-value">{boltScore.side2}</span>
      <span class="iv-player-name">{side2Player}</span>
    </button>
  </div>

  {#if pendingAction}
    <div class="iv-select-prompt">
      Tap a side for <strong>{actionLabels[pendingAction]?.label}</strong>
    </div>
  {/if}

  <!-- Actions: single column -->
  <div class="iv-actions">
    {#each actions as action (action)}
      {@const info = actionLabels[action]}
      <button
        class="intennse-btn {info.cls}"
        class:intennse-btn--selected={pendingAction === action}
        onclick={() => actionButton(action)}
        disabled={!boltStarted}
      >
        <span class="intennse-btn-label">{info.label}</span>
        {#if info.value}
          <span class="intennse-btn-value">{info.value}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Play button -->
  <div class="iv-controls">
    <button class="intennse-ctrl-btn" onclick={onUndo} disabled={!canUndo}>↩</button>
    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start"
      class:intennse-ctrl-btn--active={rallyInProgress}
      onclick={onPointStart}
    >
      {!boltStarted ? '▶' : rallyInProgress ? '⏵' : '⏯'}
    </button>
    <button class="intennse-ctrl-btn" onclick={onRedo} disabled={!canRedo}>↪</button>
  </div>

  <!-- Footer: Sub / Timeout / Penalty -->
  <div class="iv-footer">
    <button class="intennse-footer-btn" onclick={() => onSubstitute(1)}>SUB 1</button>
    <button class="intennse-footer-btn" onclick={() => onTimeout(1)}>TO 1</button>
    <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(1)}>PEN 1</button>
    <button class="intennse-footer-btn" onclick={() => onSubstitute(2)}>SUB 2</button>
    <button class="intennse-footer-btn" onclick={() => onTimeout(2)}>TO 2</button>
    <button class="intennse-footer-btn intennse-footer-btn--penalty" onclick={() => onPenalty(2)}>PEN 2</button>
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
  }

  .iv-score--selecting {
    background: var(--intennse-accent);
    border-radius: 8px;
    margin: 0.2rem;
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

  .iv-score-side--serving .iv-score-value {
    color: var(--intennse-serving);
  }

  .iv-player-name {
    font-size: 0.6rem;
    color: var(--intennse-text-muted);
    text-transform: uppercase;
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

  .iv-select-prompt {
    text-align: center;
    font-size: 0.7rem;
    color: var(--intennse-text-muted);
    padding: 0.2rem;
  }

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

  .iv-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.3rem;
    border-top: 1px solid var(--intennse-accent);
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
</style>
