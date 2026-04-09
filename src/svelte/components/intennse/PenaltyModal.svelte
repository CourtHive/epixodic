<script lang="ts">
  let {
    side,
    teamName = '',
    activePlayers,
    benchPlayers,
    onConfirm,
    onClose,
  }: {
    side: 1 | 2;
    teamName?: string;
    activePlayers: { participantId: string; participantName: string }[];
    benchPlayers: { participantId: string; participantName: string }[];
    onConfirm: (participantId: string, participantName: string, points: number) => void;
    onClose: () => void;
  } = $props();

  const allPlayers = $derived([...activePlayers, ...benchPlayers]);
  let selectedPlayer = $state<string | null>(activePlayers[0]?.participantId ?? null);
  let penaltyPoints = $state(5);

  const pointOptions = [1, 2, 5, 10];

  function handleConfirm() {
    if (!selectedPlayer) return;
    const player = allPlayers.find((p) => p.participantId === selectedPlayer);
    if (player) {
      onConfirm(player.participantId, player.participantName, penaltyPoints);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pen-overlay" onclick={onClose}>
  <div class="pen-modal" onclick={(e) => e.stopPropagation()}>
    <div class="pen-header">
      <span>Penalty — {teamName || `Side ${side}`}</span>
      <button class="pen-close" onclick={onClose}>✕</button>
    </div>

    <div class="pen-section">
      <div class="pen-section-label">Player</div>
      {#each allPlayers as player (player.participantId)}
        <button
          class="pen-player"
          class:pen-player--selected={selectedPlayer === player.participantId}
          onclick={() => (selectedPlayer = player.participantId)}
        >
          {player.participantName}
        </button>
      {/each}
    </div>

    <div class="pen-section">
      <div class="pen-section-label">Points awarded to opponent</div>
      <div class="pen-points-row">
        {#each pointOptions as pts (pts)}
          <button
            class="pen-points-btn"
            class:pen-points-btn--selected={penaltyPoints === pts}
            onclick={() => (penaltyPoints = pts)}
          >
            {pts}
          </button>
        {/each}
      </div>
    </div>

    <button
      class="pen-confirm"
      disabled={!selectedPlayer}
      onclick={handleConfirm}
    >
      Confirm Penalty ({penaltyPoints} pts)
    </button>
  </div>
</div>

<style>
  .pen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pen-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 2px solid var(--intennse-error, #ef5350);
    border-radius: 12px;
    padding: 1rem;
    min-width: 260px;
    max-width: 360px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .pen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
    color: var(--intennse-error, #ef5350);
  }

  .pen-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .pen-section {
    margin-bottom: 0.75rem;
  }

  .pen-section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.3rem;
    font-weight: 600;
  }

  .pen-player {
    display: block;
    width: 100%;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.3rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
    touch-action: manipulation;
  }

  .pen-player:active { opacity: 0.7; }
  .pen-player--selected {
    border-color: var(--intennse-error, #ef5350);
    box-shadow: 0 0 0 1px var(--intennse-error);
  }

  .pen-points-row {
    display: flex;
    gap: 0.4rem;
  }

  .pen-points-btn {
    flex: 1;
    padding: 0.6rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .pen-points-btn:active { opacity: 0.7; }
  .pen-points-btn--selected {
    border-color: var(--intennse-error, #ef5350);
    background: var(--intennse-error, #ef5350);
    color: #fff;
  }

  .pen-confirm {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: 8px;
    background: var(--intennse-error, #ef5350);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .pen-confirm:active { opacity: 0.7; }
  .pen-confirm:disabled { opacity: 0.3; cursor: default; }
</style>
