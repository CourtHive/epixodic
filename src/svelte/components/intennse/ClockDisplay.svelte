<script lang="ts">
  import { getClockSnapshot } from '../../../clock';
  import { formatTime } from '../../../clock/formatTime';

  let { clockId, label = '', size = 'normal', urgentAt = 5000, criticalAt = 3000 }: {
    clockId: string;
    label?: string;
    size?: 'compact' | 'normal' | 'large';
    urgentAt?: number;
    criticalAt?: number;
  } = $props();

  const snapshot = $derived(getClockSnapshot(clockId));
  const remaining = $derived(snapshot?.remainingMs ?? 0);
  const clockState = $derived(snapshot?.state ?? 'idle');
  const display = $derived(formatTime(remaining));

  const urgencyClass = $derived(
    clockState === 'expired' ? 'clock--expired'
    : remaining <= criticalAt ? 'clock--critical'
    : remaining <= urgentAt ? 'clock--urgent'
    : '',
  );
</script>

<div class="clock-display clock--{size} {urgencyClass}" class:clock--paused={clockState === 'paused'}>
  {#if label}
    <span class="clock-label">{label}</span>
  {/if}
  <span class="clock-time">{display}</span>
</div>
