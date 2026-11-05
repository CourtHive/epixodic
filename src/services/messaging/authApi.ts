import { logIn } from '../auth/loginState';
import { authUrl, baseApi } from './baseApi';

async function systemLogin(email, password) {
  return baseApi.post(authUrl('/auth/login'), {
    password,
    email,
  });
}

export async function submitCredentials({ email, password }) {
  const res = await systemLogin(email, password);
  if (res?.status === 200) {
    logIn(res);
  }
  return res;
}
