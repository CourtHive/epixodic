/**
 * Pure-logic helpers for the TopNav user avatar. Kept outside the Svelte
 * component so the colour-state decision is independently unit-testable
 * without a DOM — the Svelte file is purely a renderer on top of this.
 *
 * Mirrors TMX's `getLoginColor` pattern
 * (`TMX/src/functions/getLoginColor.ts`):
 *   - Logged out → muted default.
 *   - Logged in  → accent blue.
 *   - Logged in with elevated role (`score` / `superadmin`) → green.
 */

export interface AvatarAuthInput {
  /** Current value of `auth.isAuthenticated`. */
  isAuthenticated: boolean;
  /** Current value of `auth.hasScoreRole`. True for score or superadmin. */
  hasScoreRole: boolean;
  /** Current value of `auth.email` — used to build the tooltip only. */
  email?: string | null;
}

export type AvatarColorClass = 'top-nav-avatar--out' | 'top-nav-avatar--in' | 'top-nav-avatar--score';

/** Which CSS class drives the avatar's colour for the given auth state. */
export function getAvatarColorClass(input: AvatarAuthInput): AvatarColorClass {
  if (!input.isAuthenticated) return 'top-nav-avatar--out';
  if (input.hasScoreRole) return 'top-nav-avatar--score';
  return 'top-nav-avatar--in';
}

/** Tooltip text describing what a click will do in the current state. */
export function getAvatarTitle(input: AvatarAuthInput): string {
  if (!input.isAuthenticated) return 'Log in';
  const who = input.email ?? 'user';
  return `Signed in as ${who} — click to sign out`;
}

/** Screen-reader label for the avatar button. */
export function getAvatarAriaLabel(input: AvatarAuthInput): string {
  return input.isAuthenticated ? 'Sign out' : 'Log in';
}
