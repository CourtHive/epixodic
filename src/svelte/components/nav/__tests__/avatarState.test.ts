import { describe, it, expect } from 'vitest';
import {
  getAvatarColorClass,
  getAvatarTitle,
  getAvatarAriaLabel,
} from '../avatarState';

describe('getAvatarColorClass', () => {
  it('returns the logged-out class when the user is not authenticated', () => {
    expect(getAvatarColorClass({ isAuthenticated: false, hasScoreRole: false })).toBe(
      'top-nav-avatar--out',
    );
  });

  it('logged-out wins even when hasScoreRole is somehow true (stale state)', () => {
    // Defensive: isAuthenticated is the source of truth for "is there a valid
    // token". hasScoreRole is derived from token roles, so it can only be
    // true when isAuthenticated is true — but in case of lag, the class
    // still says "out" until the session re-hydrates.
    expect(getAvatarColorClass({ isAuthenticated: false, hasScoreRole: true })).toBe(
      'top-nav-avatar--out',
    );
  });

  it('returns the logged-in class for a regular authenticated user', () => {
    expect(getAvatarColorClass({ isAuthenticated: true, hasScoreRole: false })).toBe(
      'top-nav-avatar--in',
    );
  });

  it('returns the score-role class for authenticated score/superadmin users', () => {
    expect(getAvatarColorClass({ isAuthenticated: true, hasScoreRole: true })).toBe(
      'top-nav-avatar--score',
    );
  });
});

describe('getAvatarTitle', () => {
  it('invites login when not authenticated', () => {
    expect(getAvatarTitle({ isAuthenticated: false, hasScoreRole: false })).toBe('Log in');
  });

  it('includes the email when authenticated', () => {
    expect(
      getAvatarTitle({ isAuthenticated: true, hasScoreRole: false, email: 'axel@castle.com' }),
    ).toBe('Signed in as axel@castle.com — click to sign out');
  });

  it('falls back to "user" when the token has no email', () => {
    expect(getAvatarTitle({ isAuthenticated: true, hasScoreRole: false })).toBe(
      'Signed in as user — click to sign out',
    );
  });

  it('treats null email the same as missing', () => {
    expect(getAvatarTitle({ isAuthenticated: true, hasScoreRole: false, email: null })).toBe(
      'Signed in as user — click to sign out',
    );
  });

  it('email is ignored when not authenticated', () => {
    // If somehow email is populated without a valid session, the title must
    // still invite the user to log in rather than claim they're signed in.
    expect(
      getAvatarTitle({ isAuthenticated: false, hasScoreRole: false, email: 'axel@castle.com' }),
    ).toBe('Log in');
  });
});

describe('getAvatarAriaLabel', () => {
  it('"Log in" when signed out', () => {
    expect(getAvatarAriaLabel({ isAuthenticated: false, hasScoreRole: false })).toBe('Log in');
  });

  it('"Sign out" when signed in', () => {
    expect(getAvatarAriaLabel({ isAuthenticated: true, hasScoreRole: false })).toBe('Sign out');
  });
});
