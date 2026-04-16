<script lang="ts">
  import { handleLogin } from '../../stores/auth.svelte';

  let {
    onClose,
    onSuccess,
  }: {
    onClose: () => void;
    onSuccess: () => void;
  } = $props();

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!email || !password || submitting) return;

    error = '';
    submitting = true;
    try {
      await handleLogin(email, password);
      onSuccess();
    } catch (err: any) {
      error = err?.message || 'Login failed';
    } finally {
      submitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="login-overlay" onclick={onClose}>
  <div class="login-modal" onclick={(e) => e.stopPropagation()}>
    <div class="login-header">
      <span>Sign In</span>
      <button class="login-close" onclick={onClose}>✕</button>
    </div>

    <form onsubmit={handleSubmit}>
      <input
        class="login-input"
        type="email"
        inputmode="email"
        autocomplete="email"
        placeholder="Email"
        bind:value={email}
        disabled={submitting}
      />
      <input
        class="login-input"
        type="password"
        autocomplete="current-password"
        placeholder="Password"
        bind:value={password}
        disabled={submitting}
      />

      {#if error}
        <p class="login-error">{error}</p>
      {/if}

      <button
        class="login-submit"
        type="submit"
        disabled={submitting || !email || !password}
      >
        {submitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 2px solid var(--intennse-serving, #00d4aa);
    border-radius: 12px;
    padding: 1.2rem;
    min-width: 260px;
    max-width: 340px;
    width: 85%;
  }

  .login-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  .login-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .login-input {
    width: 100%;
    padding: 0.7rem 0.6rem;
    border: 2px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.9rem;
    outline: none;
    box-sizing: border-box;
  }

  .login-input:focus {
    border-color: var(--intennse-serving, #00d4aa);
  }

  .login-input:disabled {
    opacity: 0.5;
  }

  .login-error {
    color: #f87171;
    font-size: 0.8rem;
    margin: 0;
    padding: 0 0.2rem;
  }

  .login-submit {
    width: 100%;
    padding: 0.7rem;
    border: none;
    border-radius: 8px;
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    margin-top: 0.2rem;
  }

  .login-submit:active { opacity: 0.7; }
  .login-submit:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
