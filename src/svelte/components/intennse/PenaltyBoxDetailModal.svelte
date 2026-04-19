<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getPenaltyBoxState, getBoxedPlayers } from '../../stores/penaltyBox.svelte';

  let { onClose }: {
    onClose: () => void;
  } = $props();

  const boxState = getPenaltyBoxState();

  const side1Players = $derived.by(() => {
    void boxState.version;
    return getBoxedPlayers(1);
  });

  const side2Players = $derived.by(() => {
    void boxState.version;
    return getBoxedPlayers(2);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pbd-overlay" onclick={onClose}>
  <div class="pbd-modal" onclick={(e) => e.stopPropagation()}>
    <div class="pbd-header">
      <span>Penalty Box</span>
      <button class="pbd-close" onclick={onClose}>✕</button>
    </div>

    {#if side1Players.length > 0}
      <div class="pbd-section">
        <div class="pbd-section-label">Side 1</div>
        {#each side1Players as player (player.participantId)}
          <div class="pbd-entry">
            {#if player.jerseyNumber}<span class="pbd-jersey">{player.jerseyNumber}</span>{/if}
            <span class="pbd-name">{player.participantName}</span>
            <span class="pbd-timer">{formatTime(player.remainingMs)}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if side2Players.length > 0}
      <div class="pbd-section">
        <div class="pbd-section-label">Side 2</div>
        {#each side2Players as player (player.participantId)}
          <div class="pbd-entry">
            {#if player.jerseyNumber}<span class="pbd-jersey">{player.jerseyNumber}</span>{/if}
            <span class="pbd-name">{player.participantName}</span>
            <span class="pbd-timer">{formatTime(player.remainingMs)}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if side1Players.length === 0 && side2Players.length === 0}
      <div class="pbd-empty">No players in penalty box</div>
    {/if}
  </div>
</div>

<style>
  .pbd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pbd-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 2px solid var(--intennse-critical, #ef5350);
    border-radius: 12px;
    padding: 1rem;
    min-width: 240px;
    max-width: 340px;
    width: 85%;
    max-height: 60vh;
    overflow-y: auto;
  }

  .pbd-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
    color: var(--intennse-critical, #ef5350);
  }

  .pbd-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .pbd-section {
    margin-bottom: 0.5rem;
  }

  .pbd-section-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .pbd-entry {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    margin-bottom: 0.25rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    font-size: 0.85rem;
  }

  .pbd-jersey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6rem;
    height: 1.6rem;
    border-radius: 4px;
    background: var(--intennse-critical, #ef5350);
    color: #fff;
    font-weight: 800;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .pbd-name {
    flex: 1;
    font-weight: 600;
  }

  .pbd-timer {
    font-variant-numeric: tabular-nums;
    color: var(--intennse-critical, #ef5350);
    font-weight: 700;
  }

  .pbd-empty {
    text-align: center;
    font-size: 0.8rem;
    color: var(--intennse-text-muted);
    padding: 1rem;
  }
</style>
