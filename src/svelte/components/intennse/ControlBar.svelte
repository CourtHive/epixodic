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
    onBack,
    serveClock = false,
    rallyInProgress = false,
    officialPause = false,
    boltStarted = false,
    boltComplete = false,
    matchComplete = false,
    currentBoltNumber = 1,
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
    onBack?: () => void;
    serveClock?: boolean;
    rallyInProgress?: boolean;
    officialPause?: boolean;
    boltStarted?: boolean;
    boltComplete?: boolean;
    matchComplete?: boolean;
    currentBoltNumber?: number;
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

  <!-- Start/Pause/Resume/Next Bolt — full width -->
  {#if boltComplete && !matchComplete && onNextBolt}
    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start intennse-ctrl-btn--full-width"
      onclick={onNextBolt}
      title="Start next bolt"
    >
      ▶ NEXT BOLT ({currentBoltNumber + 1})
    </button>
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
