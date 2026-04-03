<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getRemainingMs, isTimeExhausted } from '../../stores/playerTime.svelte';

  let {
    side,
    activePlayers,
    benchPlayers,
    onSubstitute,
    onClose,
  }: {
    side: 1 | 2;
    activePlayers: { participantId: string; participantName: string }[];
    benchPlayers: { participantId: string; participantName: string; gender?: string }[];
    onSubstitute: (outId: string, inId: string) => void;
    onClose: () => void;
  } = $props();

  let selectedOut = $state<string | null>(null);

  function selectOut(participantId: string) {
    selectedOut = selectedOut === participantId ? null : participantId;
  }

  function selectIn(participantId: string) {
    if (!selectedOut) return;
    onSubstitute(selectedOut, participantId);
    selectedOut = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sub-overlay" onclick={onClose}>
  <div class="sub-modal" onclick={(e) => e.stopPropagation()}>
    <div class="sub-header">
      <span>Substitution — Side {side}</span>
      <button class="sub-close" onclick={onClose}>✕</button>
    </div>

    <div class="sub-section">
      <div class="sub-section-label">On Court — tap player to remove</div>
      {#each activePlayers as player (player.participantId)}
        {@const remaining = getRemainingMs(player.participantId)}
        {@const exhausted = isTimeExhausted(player.participantId)}
        <button
          class="sub-player"
          class:sub-player--selected={selectedOut === player.participantId}
          class:sub-player--exhausted={exhausted}
          onclick={() => selectOut(player.participantId)}
        >
          <span class="sub-player-name">{player.participantName}</span>
          <span class="sub-player-time" class:player-time--critical={remaining < 60000 && !exhausted}>
            {exhausted ? 'TIME' : formatTime(remaining)}
          </span>
        </button>
      {/each}
    </div>

    {#if selectedOut}
      <div class="sub-section">
        <div class="sub-section-label">Bench — tap replacement</div>
        {#each benchPlayers as player (player.participantId)}
          {@const remaining = getRemainingMs(player.participantId)}
          {@const exhausted = isTimeExhausted(player.participantId)}
          <button
            class="sub-player sub-player--bench"
            class:sub-player--exhausted={exhausted}
            onclick={() => selectIn(player.participantId)}
            disabled={exhausted}
          >
            <span class="sub-player-name">{player.participantName}</span>
            <span class="sub-player-time">
              {exhausted ? 'TIME' : formatTime(remaining)}
            </span>
          </button>
        {/each}
        {#if benchPlayers.length === 0}
          <div class="sub-empty">No eligible bench players</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .sub-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sub-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border-radius: 12px;
    padding: 1rem;
    min-width: 260px;
    max-width: 360px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .sub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
  }

  .sub-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .sub-section {
    margin-bottom: 0.75rem;
  }

  .sub-section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.3rem;
    font-weight: 600;
  }

  .sub-player {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.3rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    cursor: pointer;
    font-size: 0.85rem;
    touch-action: manipulation;
  }

  .sub-player:active { opacity: 0.7; }
  .sub-player--selected { border-color: var(--intennse-serving, #00d4aa); box-shadow: 0 0 0 1px var(--intennse-serving); }
  .sub-player--exhausted { opacity: 0.4; }
  .sub-player--exhausted .sub-player-time { color: var(--intennse-expired, #b71c1c); font-weight: 700; }

  .sub-player--bench { background: var(--intennse-accent, #0f3460); }

  .sub-player-name { font-weight: 600; }
  .sub-player-time { font-variant-numeric: tabular-nums; font-size: 0.75rem; color: var(--intennse-text-muted); }

  .sub-empty {
    text-align: center;
    font-size: 0.75rem;
    color: var(--intennse-text-muted);
    padding: 0.5rem;
  }
</style>
