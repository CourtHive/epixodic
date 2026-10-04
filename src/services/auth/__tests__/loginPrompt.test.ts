import { beforeEach, describe, expect, it, vi } from 'vitest';

const win = new EventTarget();
(globalThis as any).window = win;

import { LOGIN_REQUIRED_EVENT, requestLogin } from '../loginPrompt';

describe('requestLogin', () => {
  beforeEach(() => {
    (globalThis as any).window = win;
  });

  it('dispatches the login-required event carrying the onSuccess callback', () => {
    const received: any[] = [];
    const handler = (e: Event) => received.push((e as CustomEvent).detail);
    win.addEventListener(LOGIN_REQUIRED_EVENT, handler);

    const cb = vi.fn();
    requestLogin(cb);

    expect(received).toHaveLength(1);
    expect(received[0].onSuccess).toBe(cb);
    win.removeEventListener(LOGIN_REQUIRED_EVENT, handler);
  });

  it('is a no-op when there is no window', () => {
    (globalThis as any).window = undefined;
    expect(() => requestLogin(() => undefined)).not.toThrow();
  });
});
