import { getLoginState, logOut } from '../../services/auth/loginState';
import { submitCredentials } from '../../services/messaging/authApi';

interface DecodedToken {
  exp?: number;
  email?: string;
  roles?: string[];
  permissions?: string[];
  provider?: string;
  userId?: string;
}

let token = $state<DecodedToken | null>(null);
let isAuthenticated = $derived(!!token);
let hasScoreRole = $derived(
  token?.roles?.includes('score') || token?.roles?.includes('superadmin') || false,
);

// Hydrate on module load (returning user with valid stored JWT)
refreshAuthState();

function refreshAuthState() {
  token = (getLoginState() as DecodedToken) ?? null;
}

export async function handleLogin(email: string, password: string): Promise<void> {
  const result = await submitCredentials({ email, password });
  if (result?.status === 200) {
    refreshAuthState();
  } else {
    throw new Error(result?.data?.message || 'Login failed');
  }
}

export function handleLogout() {
  logOut();
  token = null;
}

export function getAuthState() {
  return {
    get isAuthenticated() {
      return isAuthenticated;
    },
    get hasScoreRole() {
      return hasScoreRole;
    },
    get token() {
      return token;
    },
    get email() {
      return token?.email ?? null;
    },
  };
}
