<script lang="ts">
  import { getToastState, dismissToast } from '../../stores/toast.svelte';

  const toast = getToastState();
</script>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">
    <span class="toast-message">{toast.message}</span>
    <button class="toast-close" onclick={dismissToast} aria-label="Dismiss">&times;</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-radius: 8px;
    font-size: 0.875rem;
    color: #fff;
    z-index: 9999;
    animation: slideUp 0.25s ease-out;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  .toast-error {
    background: rgba(220, 53, 69, 0.92);
  }
  .toast-success {
    background: rgba(40, 167, 69, 0.92);
  }
  .toast-info {
    background: rgba(74, 158, 255, 0.92);
  }
  .toast-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    font-size: 1.125rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .toast-close:hover {
    color: #fff;
  }
  .toast-message {
    flex: 1;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-1rem);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
