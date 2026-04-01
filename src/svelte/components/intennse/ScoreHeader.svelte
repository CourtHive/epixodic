<script lang="ts">
  import ClockDisplay from './ClockDisplay.svelte';

  let { boltLabel = '', boltClockId = 'boltTimer', serveClockId = 'serveClock' }: {
    boltLabel?: string;
    boltClockId?: string;
    serveClockId?: string;
  } = $props();
</script>

<div class="intennse-score-header">
  <ClockDisplay clockId={boltClockId} label="BOLT" size="large" urgentAt={60000} criticalAt={30000} />
  <div class="intennse-bolt-label">{boltLabel}</div>
  <ClockDisplay clockId={serveClockId} label="SERVE" size="normal" urgentAt={5000} criticalAt={3000} />
</div>
