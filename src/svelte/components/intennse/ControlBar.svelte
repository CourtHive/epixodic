<script lang="ts">
  import ClockDisplay from './ClockDisplay.svelte';
  import { getClockSnapshot } from '../../../clock';

  let {
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onPointStart,
    timeoutTeamName = '',
    onDismissTimeout,
    onCancelTimeout,
    onTimeoutSubstitute,
    side1Name = '',
    side2Name = '',
    onBack,
    serveClock = false,
    rallyInProgress = false,
    officialPause = false,
    boltStarted = false,
    boltComplete = false,
    matchComplete = false,
    currentBoltNumber = 1,
    breakActive = false,
    breakPaused = false,
    isLastBoltBreak = false,
    onPauseBreak,
    onStartNextBolt,
    onNextBolt,
  }: {
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onPointStart: () => void;
    timeoutTeamName?: string;
    onDismissTimeout: () => void;
    onCancelTimeout?: () => void;
    /** Open the Substitution modal from inside the timeout overlay. */
    onTimeoutSubstitute?: (side: 1 | 2) => void;
    side1Name?: string;
    side2Name?: string;
    onBack?: () => void;
    serveClock?: boolean;
    rallyInProgress?: boolean;
    officialPause?: boolean;
    boltStarted?: boolean;
    boltComplete?: boolean;
    matchComplete?: boolean;
    currentBoltNumber?: number;
    breakActive?: boolean;
    breakPaused?: boolean;
    isLastBoltBreak?: boolean;
    onPauseBreak?: () => void;
    onStartNextBolt?: () => void;
    onNextBolt?: () => void;
  } = $props();

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
      {#if onTimeoutSubstitute}
        <div class="intennse-timeout-sub-row">
          <button class="intennse-ctrl-btn intennse-timeout-sub" onclick={() => onTimeoutSubstitute(1)}>
            Sub {side1Name || 'Side 1'}
          </button>
          <button class="intennse-ctrl-btn intennse-timeout-sub" onclick={() => onTimeoutSubstitute(2)}>
            Sub {side2Name || 'Side 2'}
          </button>
        </div>
      {/if}
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

<div class="intennse-control-bar">
  {#if serveClock}
    <ClockDisplay clockId="serveClock" label="SERVE" size="xlarge" urgentAt={5000} criticalAt={3000} />
  {/if}

  <!-- Undo / Redo — full width row -->
  <div class="intennse-controls-row">
    <button class="intennse-ctrl-btn intennse-ctrl-btn--half intennse-ctrl-btn--undo-redo" onclick={onUndo} disabled={!canUndo} title="Undo">↩ UNDO</button>
    <button class="intennse-ctrl-btn intennse-ctrl-btn--half intennse-ctrl-btn--undo-redo" onclick={onRedo} disabled={!canRedo} title="Redo">REDO ↪</button>
  </div>

  <!-- Start/Pause/Resume — full width -->
  {#if breakActive && breakPaused}
    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start intennse-ctrl-btn--full-width"
      onclick={onStartNextBolt}
      title="Start next bolt"
    >
      ▶ START BOLT {currentBoltNumber}
    </button>
  {:else if breakActive}
    <div class="intennse-controls-row">
      <span class="intennse-break-label">{isLastBoltBreak ? 'Next match starting...' : 'Next bolt starting...'}</span>
      <button class="intennse-ctrl-btn intennse-ctrl-btn--half" onclick={onPauseBreak} title="Pause break">
        ⏸ PAUSE
      </button>
    </div>
  {:else}
    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start intennse-ctrl-btn--full-width"
      class:intennse-ctrl-btn--paused={officialPause}
      onclick={onPointStart}
      disabled={boltComplete}
      title="Start / Pause"
    >
      {#if matchComplete}
        MATCH COMPLETE
      {:else if !boltStarted}
        ▶ START BOLT {currentBoltNumber}
      {:else if officialPause}
        ▶ RESUME
      {:else}
        ⏸ PAUSE
      {/if}
    </button>
  {/if}
</div>
