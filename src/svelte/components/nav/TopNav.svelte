<script lang="ts">
  import RelayStatus from './RelayStatus.svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import NavAction from './NavAction.svelte';
  import { getNavigationState } from '../../stores/navigation.svelte';
  import type { BreadcrumbItem, NavAction as NavActionType } from '../../types';

  let { actions = [] }: { actions?: NavActionType[] } = $props();

  const nav = getNavigationState();
</script>

<nav class="top-nav">
  <div class="breadcrumbs">
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
    <RelayStatus />
    {#each actions as action}
      <NavAction label={action.label} icon={action.icon} onclick={action.action} />
    {/each}
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
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
