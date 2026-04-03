<script lang="ts">
  let {
    side,
    isServing = false,
    disabled = false,
    onWinner,
    onTouch,
    onForcedError,
    onUnforcedError,
    onAce,
    onFault,
  }: {
    side: 0 | 1;
    isServing?: boolean;
    disabled?: boolean;
    onWinner: (side: 0 | 1) => void;
    onTouch: (side: 0 | 1) => void;
    onForcedError: (side: 0 | 1) => void;
    onUnforcedError: (side: 0 | 1) => void;
    onAce: (side: 0 | 1) => void;
    onFault: (side: 0 | 1) => void;
  } = $props();
</script>

<div class="intennse-action-panel intennse-action-panel--side{side}">
  <button class="intennse-btn intennse-btn--winner" onclick={() => onWinner(side)} {disabled}>
    <span class="intennse-btn-label">Winner</span>
    <span class="intennse-btn-value">2</span>
  </button>

  <button class="intennse-btn intennse-btn--touch" onclick={() => onTouch(side)} {disabled}>
    <span class="intennse-btn-label">Touch</span>
    <span class="intennse-btn-value">1</span>
  </button>

  {#if isServing}
    <button class="intennse-btn intennse-btn--ace" onclick={() => onAce(side)} {disabled}>
      <span class="intennse-btn-label">Ace</span>
      <span class="intennse-btn-value">2</span>
    </button>
  {/if}

  <button class="intennse-btn intennse-btn--forced" onclick={() => onForcedError(side)} {disabled}>
    <span class="intennse-btn-label">Forced</span>
    <span class="intennse-btn-value">1</span>
  </button>

  <button class="intennse-btn intennse-btn--unforced" onclick={() => onUnforcedError(side)} {disabled}>
    <span class="intennse-btn-label">Error</span>
    <span class="intennse-btn-value">1</span>
  </button>

  {#if isServing}
    <button class="intennse-btn intennse-btn--fault" onclick={() => onFault(side)} {disabled}>
      <span class="intennse-btn-label">Fault</span>
    </button>
  {/if}
</div>
