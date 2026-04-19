<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getPenaltyBoxState, getBoxedPlayers } from '../../stores/penaltyBox.svelte';

  let { sideNumber, onTap }: {
    sideNumber: 1 | 2;
    onTap?: () => void;
  } = $props();

  const boxState = getPenaltyBoxState();

  const boxedPlayers = $derived.by(() => {
    void boxState.version;
    return getBoxedPlayers(sideNumber);
  });

  const hasEntries = $derived(boxedPlayers.length > 0);

  // Show the timer of the player closest to release (lowest remaining)
  const lowestTimer = $derived.by(() => {
    if (!boxedPlayers.length) return 0;
    return Math.min(...boxedPlayers.map((p) => p.remainingMs));
  });

</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pbi-slot">
  {#if hasEntries}
    <button class="pbi" onclick={onTap}>
      {#each boxedPlayers as player (player.participantId)}
        <span class="pbi-jersey">{player.jerseyNumber ?? '?'}</span>
      {/each}
      <span class="pbi-timer">{formatTime(lowestTimer)}</span>
    </button>
  {/if}
</div>

<style>
  .pbi-slot {
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
  }

  .pbi-slot:first-child {
    justify-content: flex-start;
  }

  .pbi {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    background: rgba(183, 28, 28, 0.2);
    border: 1px solid var(--intennse-critical, #ef5350);
    color: var(--intennse-critical, #ef5350);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    white-space: nowrap;
  }

  .pbi:active { opacity: 0.7; }

  .pbi-jersey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.4rem;
    border-radius: 3px;
    background: var(--intennse-critical, #ef5350);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .pbi-timer {
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }
</style>
