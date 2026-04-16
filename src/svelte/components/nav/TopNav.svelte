<script lang="ts">
  import RelayStatus from './RelayStatus.svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import NavAction from './NavAction.svelte';
  import LoginModal from '../shared/LoginModal.svelte';
  import { getNavigationState } from '../../stores/navigation.svelte';
  import { getAuthState, handleLogout } from '../../stores/auth.svelte';
  import type { BreadcrumbItem, NavAction as NavActionType } from '../../types';

  let { actions = [], backAction }: { actions?: NavActionType[]; backAction?: () => void } = $props();

  const nav = getNavigationState();
  const auth = getAuthState();

  let showLoginModal = $state(false);
</script>

<nav class="top-nav">
  <div class="top-nav-left">
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
  <div class="top-nav-center">
    {#each actions as action}
      <NavAction label={action.label} icon={action.icon} onclick={action.action} />
    {/each}
  </div>
  <div class="top-nav-right">
    <RelayStatus />
    {#if auth.isAuthenticated}
      <button class="top-nav-auth top-nav-auth--in" onclick={handleLogout} title="Sign out">
        {auth.email?.[0]?.toUpperCase() ?? '?'}
      </button>
    {:else}
      <button class="top-nav-auth top-nav-auth--out" onclick={() => (showLoginModal = true)}>
        Login
      </button>
    {/if}
  </div>
</nav>

{#if showLoginModal}
  <LoginModal
    onClose={() => (showLoginModal = false)}
    onSuccess={() => (showLoginModal = false)}
  />
{/if}

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
  .top-nav-left {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .top-nav-center {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }
  .top-nav-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    justify-content: flex-end;
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
  .top-nav-auth {
    border: none;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    touch-action: manipulation;
    line-height: 1;
  }
  .top-nav-auth:active { opacity: 0.7; }
  .top-nav-auth--out {
    background: var(--ep-accent, #3b82f6);
    color: #fff;
  }
  .top-nav-auth--in {
    background: #10b981;
    color: #fff;
    min-width: 1.6rem;
    text-align: center;
    border-radius: 50%;
    padding: 0.3rem;
    font-size: 0.7rem;
  }
</style>
