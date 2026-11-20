import { jwtDecode } from 'jwt-decode';

export function validateToken(token) {
  if (!token || token === 'undefined') {
    return undefined;
  }

  const decodedToken = jwtDecode(token);
  const dateNow = new Date();

  // a token without `exp` never reads as expired, as before (undefined < n is false)
  const expiry = decodedToken?.exp;
  const tokenExpired = expiry !== undefined && expiry < dateNow.getTime() / 1000;
  if (tokenExpired) return undefined;

  return decodedToken;
}
