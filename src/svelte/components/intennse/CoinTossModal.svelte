<script lang="ts">
  let {
    side1Name,
    side2Name,
    onResult,
    onClose,
  }: {
    side1Name: string;
    side2Name: string;
    onResult: (servingSide: 0 | 1) => void;
    onClose: () => void;
  } = $props();

  let flipping = $state(false);
  let result = $state<0 | 1 | null>(null);

  function flip() {
    flipping = true;
    result = null;
    setTimeout(() => {
      result = Math.random() < 0.5 ? 0 : 1;
      flipping = false;
    }, 800);
  }

  function choose(side: 0 | 1) {
    onResult(side);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ct-overlay" onclick={onClose}>
  <div class="ct-modal" onclick={(e) => e.stopPropagation()}>
    <div class="ct-header">
      <span>Who serves first?</span>
      <button class="ct-close" onclick={onClose}>✕</button>
    </div>

    <div class="ct-options">
      <button class="ct-side" class:ct-side--selected={result === 0} onclick={() => choose(0)}>
        {side1Name}
      </button>
      <button class="ct-side" class:ct-side--selected={result === 1} onclick={() => choose(1)}>
        {side2Name}
      </button>
    </div>

    <div class="ct-divider">or</div>

    <button class="ct-flip" class:ct-flip--flipping={flipping} onclick={flip} disabled={flipping}>
      {#if flipping}
        🪙
      {:else if result !== null}
        {result === 0 ? side1Name : side2Name} serves
      {:else}
        🪙 Flip Coin
      {/if}
    </button>

    {#if result !== null && !flipping}
      <button class="ct-confirm" onclick={() => choose(result!)}>
        Confirm: {result === 0 ? side1Name : side2Name} serves first
      </button>
    {/if}
  </div>
</div>

<style>
  .ct-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ct-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 2px solid var(--intennse-serving, #00d4aa);
    border-radius: 12px;
    padding: 1.2rem;
    min-width: 260px;
    max-width: 340px;
    width: 85%;
    text-align: center;
  }

  .ct-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  .ct-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
  }

  .ct-options {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .ct-side {
    flex: 1;
    padding: 0.75rem 0.5rem;
    border: 2px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color 0.15s;
  }

  .ct-side:active { opacity: 0.7; }
  .ct-side--selected {
    border-color: var(--intennse-serving, #00d4aa);
    box-shadow: 0 0 6px rgba(0, 212, 170, 0.4);
  }

  .ct-divider {
    font-size: 0.7rem;
    color: var(--intennse-text-muted);
    margin-bottom: 0.75rem;
  }

  .ct-flip {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-accent, #0f3460);
    color: var(--intennse-text, #e0e0e0);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    margin-bottom: 0.5rem;
  }

  .ct-flip:active { opacity: 0.7; }
  .ct-flip:disabled { cursor: default; }
  .ct-flip--flipping {
    animation: spin-coin 0.8s ease-in-out;
    font-size: 2rem;
  }

  @keyframes spin-coin {
    0% { transform: rotateY(0deg); }
    50% { transform: rotateY(180deg); }
    100% { transform: rotateY(360deg); }
  }

  .ct-confirm {
    width: 100%;
    padding: 0.65rem;
    border: none;
    border-radius: 8px;
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .ct-confirm:active { opacity: 0.7; }
</style>
