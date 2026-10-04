/**
 * Global "please log in" request — a small decoupled primitive so any context
 * (vanilla scoring flow, scoring-modal close) can ask the app to open the login
 * modal and run a callback once the user authenticates, without importing the
 * Svelte login component. `TopNav` (always mounted) listens for the event and
 * owns the `LoginModal`.
 */

export const LOGIN_REQUIRED_EVENT = 'epixodic:login-required';

export interface LoginRequiredDetail {
  /** Run once the user successfully authenticates. */
  onSuccess?: () => void;
}

/** Ask the app to open the login modal; `onSuccess` runs after authentication. */
export function requestLogin(onSuccess?: () => void): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LoginRequiredDetail>(LOGIN_REQUIRED_EVENT, { detail: { onSuccess } }));
}
