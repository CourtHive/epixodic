<script lang="ts">
  import { getClockSnapshot, pauseClock, setClockRemaining } from '../../../clock';
  import { formatTime } from '../../../clock/formatTime';
  import { getClockEditLimits, clampClockValue, stepClockValue } from '../../../intennse/clockEditing';

  let { clockId, label = '', size = 'normal', urgentAt = 5000, criticalAt = 3000 }: {
    clockId: string;
    label?: string;
    size?: 'compact' | 'normal' | 'large' | 'xlarge';
    urgentAt?: number;
    criticalAt?: number;
  } = $props();

  const snapshot = $derived(getClockSnapshot(clockId));
  const remaining = $derived(snapshot?.remainingMs ?? 0);
  const clockState = $derived(snapshot?.state ?? 'idle');
  const display = $derived(formatTime(remaining));
  const editable = $derived(!!getClockEditLimits(clockId));

  let editing = $state(false);
  let editValue = $state(0);

  const editDisplay = $derived(formatTime(editValue));

  const urgencyClass = $derived(
    clockState === 'expired' ? 'clock--expired'
    : remaining <= criticalAt ? 'clock--critical'
    : remaining <= urgentAt ? 'clock--urgent'
    : '',
  );

  function startEditing() {
    if (!editable) return;
    pauseClock(clockId);
    editValue = remaining;
    editing = true;
  }

  function step(direction: 'up' | 'down') {
    editValue = stepClockValue(clockId, editValue, direction);
  }

  function confirmEdit() {
    const clamped = clampClockValue(clockId, editValue);
    setClockRemaining(clockId, clamped);
    editing = false;
  }

  function cancelEdit() {
    editing = false;
  }
</script>

{#if editing}
  <div class="clock-display clock--{size} clock--editing">
    {#if label}
      <span class="clock-label">{label}</span>
    {/if}
    <div class="clock-edit">
      <button class="clock-edit-btn" onclick={() => step('down')}>−</button>
      <span class="clock-time">{editDisplay}</span>
      <button class="clock-edit-btn" onclick={() => step('up')}>+</button>
    </div>
    <div class="clock-edit-actions">
      <button class="clock-edit-confirm" onclick={confirmEdit}>✓</button>
      <button class="clock-edit-cancel" onclick={cancelEdit}>✕</button>
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="clock-display clock--{size} {urgencyClass}"
    class:clock--paused={clockState === 'paused'}
    class:clock--editable={editable}
    onclick={startEditing}
  >
    {#if label}
      <span class="clock-label">{label}</span>
    {/if}
    <span class="clock-time">{display}</span>
  </div>
{/if}
