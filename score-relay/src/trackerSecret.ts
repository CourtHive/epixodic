/**
 * The HS256 secret /tracker verifies against — the same CFS `JWT_SECRET` that /crowd and the crowd REST API read,
 * so every relay surface shares one trust root (ES256 keys are already shared via `loadEs256Keys`).
 *
 * `TRACKER_JWT_SECRET` predates that: a second copy of `JWT_SECRET` that was only ever meant to equal it. A copy
 * can drift, and a rename that leaves it unset on one host turns /tracker into anonymous-admin. It is still read,
 * as a deprecated override, so a host that sets it keeps its behavior; the warning says whether it is redundant
 * (equal) or diverged (different), which is the case that needs an operator.
 */
export interface TrackerSecret {
  secret?: string;
  source?: 'JWT_SECRET' | 'TRACKER_JWT_SECRET';
  warning?: string;
}

export function resolveTrackerSecret(env: NodeJS.ProcessEnv = process.env): TrackerSecret {
  const shared = env.JWT_SECRET?.trim() || undefined;
  const override = env.TRACKER_JWT_SECRET?.trim() || undefined;

  if (!override) return shared ? { secret: shared, source: 'JWT_SECRET' } : {};

  const warning = !shared
    ? 'TRACKER_JWT_SECRET is deprecated: set JWT_SECRET (the secret /crowd uses) instead.'
    : override === shared
      ? 'TRACKER_JWT_SECRET is deprecated and equals JWT_SECRET: remove it.'
      : 'TRACKER_JWT_SECRET is deprecated and DIFFERS from JWT_SECRET: /tracker and /crowd verify against ' +
        'different secrets. Remove TRACKER_JWT_SECRET once CFS signs with JWT_SECRET alone.';
  return { secret: override, source: 'TRACKER_JWT_SECRET', warning };
}
