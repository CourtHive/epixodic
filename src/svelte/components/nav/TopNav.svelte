<script lang="ts">
  import RelayStatus from './RelayStatus.svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import NavAction from './NavAction.svelte';
  import { getNavigationState } from '../../stores/navigation.svelte';
  import type { BreadcrumbItem, NavAction as NavActionType } from '../../types';

  let { actions = [], backAction }: { actions?: NavActionType[]; backAction?: () => void } = $props();

  const nav = getNavigationState();
</script>

<nav class="top-nav">
  <div class="breadcrumbs">
    {#if backAction}
      <button class="top-nav-back" onclick={backAction}>←</button>
    {/if}
    {#each nav.breadcrumbs as item}
      <Breadcrumb
        {item}
        onclick={() => {
          if (!item.active) {
            const router = (window as any).appRouter;
            router?.navigate(item.path);
          }
        }}
      />
    {/each}
  </div>
  <div class="actions">
    {#each actions as action}
      <NavAction label={action.label} icon={action.icon} onclick={action.action} />
    {/each}
    <RelayStatus />
  </div>
</nav>

<style>
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 1rem;
    background: var(--ep-page-secondary-bg);
    border-bottom: 1px solid var(--ep-page-border);
    flex-shrink: 0;
  }
  .breadcrumbs {
    display: flex;
    align-items: center;
  }
  .top-nav-back {
    background: none;
    border: none;
    color: var(--ep-accent, #3b82f6);
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.2rem 0.5rem 0.2rem 0;
    touch-action: manipulation;
  }
  .top-nav-back:active { opacity: 0.7; }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    justify-content: flex-end;
  }
</style>
