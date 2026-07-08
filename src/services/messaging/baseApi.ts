import { getJwtTokenStorageKey } from '../../config/getJwtTokenStorageKey';
import { browserStorage } from '../../state/browserStorage';
import axios from 'axios';

const JWT_TOKEN_STORAGE_NAME = getJwtTokenStorageKey();
const baseURL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8383';
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
