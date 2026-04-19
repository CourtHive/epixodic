<script lang="ts">
  import RelayStatus from './RelayStatus.svelte';
  import Breadcrumb from './Breadcrumb.svelte';
  import NavAction from './NavAction.svelte';
  import LoginModal from '../shared/LoginModal.svelte';
  import { getNavigationState } from '../../stores/navigation.svelte';
  import { getAuthState, handleLogout } from '../../stores/auth.svelte';
  import { getAvatarAriaLabel, getAvatarColorClass, getAvatarTitle } from './avatarState';
  import type { BreadcrumbItem, NavAction as NavActionType } from '../../types';

  let { actions = [], backAction }: { actions?: NavActionType[]; backAction?: () => void } = $props();

  const nav = getNavigationState();
  const auth = getAuthState();

  // Reactive snapshot used by the avatar helpers — rebuilds whenever any
  // field of auth changes.
  const avatarAuth = $derived({
    isAuthenticated: auth.isAuthenticated,
    hasScoreRole: auth.hasScoreRole,
    email: auth.email,
  });

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
    <button
      class="top-nav-avatar {getAvatarColorClass(avatarAuth)}"
      onclick={() => (auth.isAuthenticated ? handleLogout() : (showLoginModal = true))}
      title={getAvatarTitle(avatarAuth)}
      aria-label={getAvatarAriaLabel(avatarAuth)}
    >
      <!-- fa-solid fa-circle-user path, inlined — epixodic has no FontAwesome dep. -->
      <svg class="top-nav-avatar-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M399 384.2C376.9 345.8 335.4 320 288 320H224c-47.4 0-88.9 25.8-111 64.2c35.2 39.2 86.2 63.8 143 63.8s107.8-24.6 143-63.8zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 16a72 72 0 1 0 0-144 72 72 0 1 0 0 144z"/>
      </svg>
    </button>
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
  /* User avatar — mirrors TMX's fa-circle-user + color-by-state pattern.
   * Icon colour is driven by currentColor so the state classes below
   * set a single colour that propagates into the SVG fill. */
  .top-nav-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    padding: 0.2rem;
    cursor: pointer;
    touch-action: manipulation;
    line-height: 0;
    color: var(--ep-page-text-muted, #888);
    transition: color 0.15s, transform 0.1s;
  }
  .top-nav-avatar:hover { transform: scale(1.05); }
  .top-nav-avatar:active { transform: scale(0.95); opacity: 0.8; }
  .top-nav-avatar:focus-visible {
    outline: 2px solid var(--ep-accent, #3b82f6);
    outline-offset: 2px;
    border-radius: 50%;
  }

  .top-nav-avatar-icon {
    width: 1.6rem;
    height: 1.6rem;
    display: block;
  }

  /* Logged out: muted default. */
  .top-nav-avatar--out { color: var(--ep-page-text-muted, #888); }
  /* Logged in, regular user: accent (blue). */
  .top-nav-avatar--in { color: var(--ep-accent, #3b82f6); }
  /* Logged in with elevated role (score/superadmin): green. */
  .top-nav-avatar--score { color: #10b981; }
</style>
