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
    onBack,
    rallyInProgress = false,
    boltStarted = false,
  }: {
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onPointStart: () => void;
    timeoutTeamName?: string;
    onDismissTimeout: () => void;
    onBack?: () => void;
    rallyInProgress?: boolean;
    boltStarted?: boolean;
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
    </div>
  </div>
{/if}

<div class="intennse-control-bar">
  <!-- Start/Play/Rally — full width -->
  <button
    class="intennse-ctrl-btn intennse-ctrl-btn--point-start intennse-ctrl-btn--full-width"
    class:intennse-ctrl-btn--active={rallyInProgress}
    onclick={onPointStart}
    title="Point Start"
  >
    {!boltStarted ? '▶ START' : rallyInProgress ? '⏵ RALLY' : '⏯ PLAY'}
  </button>
</div>
