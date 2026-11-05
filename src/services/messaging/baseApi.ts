import { getJwtTokenStorageKey } from '../../config/getJwtTokenStorageKey';
import { browserStorage } from '../../state/browserStorage';
import axios from 'axios';

const JWT_TOKEN_STORAGE_NAME = getJwtTokenStorageKey();
/**
 * A backend's origin. On localhost each service is its own port; anywhere else they share the page's origin,
 * because production serves epixodic from courthive.net/epixodic/ and nginx routes the API paths. A configured
 * URL wins in both places.
 *
 * Production used to fall back to `http://localhost:8383` (no `VITE_SERVER_URL` is set where it is built), so
 * every API call from courthive.net — login included — went to the visitor's own machine.
 */
export function serviceOrigin(
  configured: string | undefined,
  localDefault: string,
  location: { hostname: string; origin: string } | undefined = globalThis.location,
): string {
  if (configured) return configured;
  const host = location?.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') return localDefault;
  return location.origin;
}

const baseURL = serviceOrigin(import.meta.env.VITE_SERVER_URL, 'http://localhost:8383');

/**
 * The identity provider (courthive-hiveid) URL for an `/auth/*` path: login belongs to it, not CFS. Production
 * routes `/auth/*` to it same-origin; locally it is :3140, or `VITE_AUTH_SERVER_URL`. An absolute URL bypasses
 * axios's `baseURL` but keeps the interceptors.
 */
export function authUrl(path: string): string {
  return `${serviceOrigin(import.meta.env.VITE_AUTH_SERVER_URL, 'http://localhost:3140')}${path}`;
}
const axiosInstance = axios.create({ baseURL });

axiosInstance.interceptors.request.use(
  (config) => {
    const token = browserStorage.get(JWT_TOKEN_STORAGE_NAME);
    if (token) {
      // Per-request headers live directly on `config.headers` (an AxiosHeaders
      // instance). `.common` only exists on `axiosInstance.defaults.headers`,
      // so `config.headers.common` is undefined here — assigning through it
      // throws. Matches the TMX/AMS baseApi pattern.
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) removeAuthorization();
    // Re-reject so callers' catch blocks see the real failure. Returning
    // nothing here would resolve the request with `undefined`, and callers
    // that read `response.data` would then throw a misleading
    // "Cannot read properties of undefined (reading 'data')" instead of the
    // actual HTTP status.
    return Promise.reject(error);
  },
);

const addAuthorization = () => {
  const token = browserStorage.get(JWT_TOKEN_STORAGE_NAME);
  if (token) {
    axiosInstance.defaults.headers.common.authorization = `Bearer ${token}`;
  }
};

const removeAuthorization = () => {
  axiosInstance.defaults.headers.common.authorization = undefined;
};

export const baseApi: any = {
  ...axiosInstance,
  removeAuthorization,
  addAuthorization,
};
