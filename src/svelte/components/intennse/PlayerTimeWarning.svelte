<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';

  let { playerName = '', remainingMs = 0, onDismiss }: {
    playerName: string;
    remainingMs: number;
    onDismiss?: () => void;
  } = $props();

  const isExhausted = $derived(remainingMs <= 0);
</script>

{#if remainingMs <= 120000}
  <div class="ptw" class:ptw--critical={remainingMs <= 60000} class:ptw--exhausted={isExhausted}>
    <span class="ptw-name">{playerName}</span>
    {#if isExhausted}
      <span class="ptw-msg">TIME EXHAUSTED — must substitute</span>
    {:else}
      <span class="ptw-msg">{formatTime(remainingMs)} remaining</span>
    {/if}
    {#if onDismiss}
      <button class="ptw-dismiss" onclick={onDismiss}>✕</button>
    {/if}
  </div>
{/if}

<style>
  .ptw {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--intennse-urgent, #ff9800);
    color: #000;
    animation: ptw-slide-in 0.3s ease-out;
  }

  .ptw--critical {
    background: var(--intennse-critical, #ef5350);
    color: #fff;
  }

  .ptw--exhausted {
    background: var(--intennse-expired, #b71c1c);
    color: #fff;
    animation: ptw-pulse 1s infinite;
  }

  .ptw-name { font-weight: 700; }
  .ptw-msg { flex: 1; }

  .ptw-dismiss {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0.1rem;
  }

  @keyframes ptw-slide-in {
    from { transform: translateY(-100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  @keyframes ptw-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
