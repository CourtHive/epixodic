import { beforeEach, describe, expect, it, vi } from 'vitest';

// A single fake axios instance returned by every axios.create() call, so we can
// grab the interceptor handlers baseApi registers at module load and drive them
// directly. Declared via vi.hoisted so it exists when the (hoisted) vi.mock
// factory runs. Mirrors TMX's src/services/apis/baseApi.test.ts. NOTE: the
// ecosystem does NOT use axios-mock-adapter/msw/nock — this is the house pattern.
const { fakeInstance, storageGet } = vi.hoisted(() => {
  const storageGet = vi.fn();
  const fakeInstance: any = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: { headers: { common: {} }, baseURL: '' },
    post: vi.fn(),
  };
  return { fakeInstance, storageGet };
});

vi.mock('axios', () => ({ default: { create: () => fakeInstance }, create: () => fakeInstance }));
vi.mock('../../../state/browserStorage', () => ({
  browserStorage: { get: storageGet, set: vi.fn(), remove: vi.fn() },
}));

// Side-effect import: executing the module registers the request + response
// interceptors on fakeInstance (captured in the vi.fn().mock.calls below).
import '../baseApi';

// interceptors.<x>.use(onFulfilled, onRejected) — pull the registered handlers.
const [requestFulfilled] = fakeInstance.interceptors.request.use.mock.calls[0];
const [, responseRejected] = fakeInstance.interceptors.response.use.mock.calls[0];

beforeEach(() => {
  storageGet.mockReset();
  fakeInstance.defaults.headers.common = {};
});

describe('baseApi request interceptor — auth header', () => {
  it('sets a per-request Authorization header when a token is stored', () => {
    storageGet.mockReturnValue('tok_abc');
    const config: any = { headers: {} };
    const result = requestFulfilled(config);
    expect(result.headers.Authorization).toBe('Bearer tok_abc');
    // Regression: the header must be written to config.headers directly, NOT via
    // config.headers.common (undefined on a per-request config → would throw).
    expect(config.headers.common).toBeUndefined();
  });

  it('leaves the Authorization header unset when no token is stored', () => {
    storageGet.mockReturnValue(undefined);
    const config: any = { headers: {} };
    const result = requestFulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

describe('baseApi response interceptor — error propagation', () => {
  it('re-rejects a failed request instead of swallowing it (no resolve-with-undefined)', async () => {
    // Regression for the "Cannot read properties of undefined (reading 'data')"
    // bug: the rejection handler must return a rejected promise so callers'
    // catch blocks run — not resolve the request with undefined.
    const error: any = { message: 'Request failed with status code 500', response: { status: 500 } };
    await expect(responseRejected(error)).rejects.toBe(error);
  });

  it('clears the stored authorization on a 401 and still re-rejects', async () => {
    fakeInstance.defaults.headers.common.authorization = 'Bearer stale';
    const error: any = { response: { status: 401 } };
    await expect(responseRejected(error)).rejects.toBe(error);
    expect(fakeInstance.defaults.headers.common.authorization).toBeUndefined();
  });
});
