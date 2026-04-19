<script lang="ts">
  let {
    side,
    isServing = false,
    rallyInProgress = false,
    disabled = false,
    onWinner,
    onTouch,
    onForcedError,
    onUnforcedError,
    onAce,
    onFault,
    onRallyStart,
    rallyCount = 0,
    showForcedError = true,
  }: {
    side: 0 | 1;
    isServing?: boolean;
    rallyInProgress?: boolean;
    disabled?: boolean;
    showForcedError?: boolean;
    onWinner: (side: 0 | 1) => void;
    onTouch: (side: 0 | 1) => void;
    onForcedError: (side: 0 | 1) => void;
    onUnforcedError: (side: 0 | 1) => void;
    onAce: (side: 0 | 1) => void;
    onFault: (side: 0 | 1) => void;
    onRallyStart?: () => void;
    rallyCount?: number;
  } = $props();
</script>

<div class="intennse-action-panel intennse-action-panel--side{side}">
  <button class="intennse-btn intennse-btn--winner" onclick={() => onWinner(side)} {disabled}>
    <span class="intennse-btn-label">Winner</span>
  </button>

  <button class="intennse-btn intennse-btn--touch" onclick={() => onTouch(side)} {disabled}>
    <span class="intennse-btn-label">Touch</span>
  </button>

  {#if showForcedError}
    <button class="intennse-btn intennse-btn--forced" onclick={() => onForcedError(side)} {disabled}>
      <span class="intennse-btn-label">Forced</span>
    </button>
  {/if}

  <button class="intennse-btn intennse-btn--unforced" onclick={() => onUnforcedError(side)} {disabled}>
    <span class="intennse-btn-label">Error</span>
  </button>

  {#if isServing}
    <button class="intennse-btn intennse-btn--ace" onclick={() => onAce(side)} {disabled}>
      <span class="intennse-btn-label">Ace</span>
    </button>
    <button class="intennse-btn intennse-btn--fault" onclick={() => onFault(side)} {disabled}>
      <span class="intennse-btn-label">Fault</span>
    </button>
  {:else}
    <div class="intennse-btn intennse-btn-placeholder" aria-hidden="true">
      <span class="intennse-btn-label">Ace</span>
    </div>
    <button
      class="intennse-btn intennse-btn--rally"
      onclick={() => onRallyStart?.()}
      disabled={disabled || !onRallyStart}
    >
      {rallyCount > 0 ? `Rally ${rallyCount}` : 'Rally'}
    </button>
  {/if}
</div>
