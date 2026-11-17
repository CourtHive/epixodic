<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getRelayStatus, onRelayStatusChange, type RelayStatus } from '../../../services/messaging/scoreRelay';

  let status = $state<RelayStatus>(getRelayStatus());
  let unsub: (() => void) | undefined;

  onMount(() => {
    unsub = onRelayStatusChange((s) => (status = s));
  });

  onDestroy(() => unsub?.());

  const LABELS: Record<RelayStatus, string> = {
    connected: 'Relay',
    connecting: 'Connecting...',
    unauthorized: 'Sign in to relay scores',
    error: 'Relay offline',
    disconnected: 'Relay offline',
  };
  const label = $derived(LABELS[status]);

  const showIndicator = $derived(status !== 'disconnected');
</script>

{#if showIndicator}
  <div class="relay-status" class:connected={status === 'connected'} class:error={status === 'error'} class:connecting={status === 'connecting'} class:unauthorized={status === 'unauthorized'} title={label}>
    <span class="relay-dot"></span>
    <span class="relay-label">{label}</span>
  </div>
{/if}

<style>
  .relay-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 12px;
    background: rgba(239, 68, 68, 0.1);
    color: var(--ep-page-text-muted, #888);
  }
  .relay-status.connected {
    background: rgba(34, 197, 94, 0.1);
  }
  .relay-status.connecting {
    background: rgba(245, 158, 11, 0.1);
  }
  .relay-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
  }
  .connected .relay-dot {
    background: #22c55e;
  }
  .relay-status.unauthorized {
    background: rgba(245, 158, 11, 0.1);
  }
  .unauthorized .relay-dot {
    background: #f59e0b;
  }
  .connecting .relay-dot {
    background: #f59e0b;
    animation: pulse-dot 1s ease-in-out infinite;
  }
  .relay-label {
    white-space: nowrap;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
