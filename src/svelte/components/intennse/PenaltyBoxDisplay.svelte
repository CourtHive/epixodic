<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getPenaltyBoxState, getBoxedPlayers } from '../../stores/penaltyBox.svelte';

  const boxState = getPenaltyBoxState();

  // Re-derive on every version bump
  const boxedPlayers = $derived.by(() => {
    void boxState.version;
    return getBoxedPlayers();
  });

  const hasEntries = $derived(boxedPlayers.length > 0);
</script>

{#if hasEntries}
  <div class="penalty-box-display">
    <div class="pb-label">PENALTY BOX</div>
    {#each boxedPlayers as player (player.participantId)}
      <div class="pb-entry pb-entry--side{player.sideNumber}">
        <span class="pb-name">{player.participantName}</span>
        <span class="pb-timer">{formatTime(player.remainingMs)}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .penalty-box-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.6rem;
    background: rgba(183, 28, 28, 0.15);
    border: 1px solid var(--intennse-critical, #ef5350);
    border-radius: 6px;
    font-size: 0.7rem;
  }

  .pb-label {
    font-weight: 700;
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--intennse-critical, #ef5350);
    white-space: nowrap;
  }

  .pb-entry {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: var(--intennse-surface, #16213e);
  }

  .pb-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .pb-timer {
    font-variant-numeric: tabular-nums;
    color: var(--intennse-critical, #ef5350);
    font-weight: 700;
  }
</style>
