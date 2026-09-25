import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Organization, UserRole } from '../types';
import { api, apiRequest, ApiError, SESSION_ENDED_EVENT } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { websocketUrl } from '../config';

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isWsConnected: boolean;
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<{ user: User; organization: Organization | null }>;
  registerOrg: (data: any) => Promise<{ user: User; organization: Organization }>;
  impersonate: (options: { userId?: string; organizationId?: string }) => Promise<{ user: User; organization: Organization | null }>;
  stopImpersonating: () => Promise<void>;
  logout: () => void;
  logoutEverywhere: () => Promise<void>;
  adoptToken: (token: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'sports_saas_token';
/** The super admin's own token, parked while they look through someone else's account. */
const IMPERSONATOR_KEY = 'sports_saas_impersonator_token';

/**
 * Leave an impersonation in storage: the admin's own token becomes the
 * session's again. Returns the borrowed token it replaced, or null when there
 * is no separate admin session to go back to.
 *
 * The switch happens before anything talks to the server, so a request still
 * in flight with the borrowed token can't end the admin's session when it
 * comes back refused (api.ts only acts on a rejection of the current token).
 */
function swapBackToImpersonator(): string | null {
  const adminToken = localStorage.getItem(IMPERSONATOR_KEY);
  const borrowed = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(IMPERSONATOR_KEY);
  if (!adminToken || adminToken === borrowed) return null;

  localStorage.setItem(TOKEN_KEY, adminToken);
  localStorage.removeItem('sports_saas_demo_role');
  localStorage.removeItem('sports_saas_demo_org_id');
  return borrowed;
}

/** Revoke a token this tab has already switched away from. */
function revokeToken(token: string) {
  apiRequest('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [role, setRole] = useState<UserRole>('PUBLIC_USER');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  const fetchCurrentUser = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setUser(null);
      setOrganization(null);
      setRole('PUBLIC_USER');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Only the server saying no ends the session. A dropped connection, the
    // API restarting or a busy moment (429/5xx) says nothing about the token,
    // and signing someone out over a flaky ground-side network loses their
    // place for nothing — try again a few times and keep the token either way.
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await api.get('/auth/me');
        setUser(res.user);
        setOrganization(res.organization);
        if (res.user?.role) {
          setRole(res.user.role);
        }
        setIsLoading(false);
        return;
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const rejected = status === 401 || (status === 403 && !!(err as ApiError).code?.startsWith('ORGANIZATION_'));
        if (rejected) {
          // An impersonated account that stopped working (its password
          // changed, its club suspended) ends the impersonation, not the
          // super admin's own session.
          const borrowed = swapBackToImpersonator();
          if (borrowed) {
            revokeToken(borrowed);
            const adminToken = localStorage.getItem(TOKEN_KEY)!;
            setToken(adminToken);
            return fetchCurrentUser();
          }
          break;
        }
        if (attempt >= 3 || localStorage.getItem(TOKEN_KEY) !== storedToken) {
          setIsLoading(false);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }

    console.warn('Session expired or invalid, logging out');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(IMPERSONATOR_KEY);
    localStorage.removeItem('sports_saas_demo_role');
    localStorage.removeItem('sports_saas_demo_org_id');
    setUser(null);
    setOrganization(null);
    setToken(null);
    setRole('PUBLIC_USER');
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.token) {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.removeItem(IMPERSONATOR_KEY);
        localStorage.setItem('sports_saas_demo_role', res.user.role);
        if (res.user.organization_id) {
          localStorage.setItem('sports_saas_demo_org_id', res.user.organization_id);
        }
        setToken(res.token);
        setUser(res.user);
        setOrganization(res.organization || null);
        setRole(res.user.role);
        return { user: res.user, organization: res.organization || null };
      }
      throw new Error('Invalid login response from server');
    } finally {
      setIsLoading(false);
    }
  };

  const registerOrg = async (data: any) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register-org', data);
      if (res.token) {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.removeItem(IMPERSONATOR_KEY);
        localStorage.setItem('sports_saas_demo_role', res.user.role);
        if (res.organization?.id) {
          localStorage.setItem('sports_saas_demo_org_id', res.organization.id);
        }
        setToken(res.token);
        setUser(res.user);
        setOrganization(res.organization);
        setRole(res.user.role);
        return { user: res.user, organization: res.organization };
      }
      throw new Error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const impersonate = async (options: { userId?: string; organizationId?: string }) => {
    // Asked with the admin's own token; nothing is stored until the server
    // says yes, so a refused attempt leaves the admin exactly where they were.
    const adminToken = localStorage.getItem(TOKEN_KEY);
    const res = await api.post('/admin/impersonate', {
      user_id: options.userId,
      organization_id: options.organizationId,
    });

    if (!res.token) throw new Error('Impersonation failed to return a valid token');

    // Only a super admin's own session may impersonate, so the token that
    // asked is always the one to come back to — never a stale parked one.
    if (adminToken) localStorage.setItem(IMPERSONATOR_KEY, adminToken);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem('sports_saas_demo_role', res.user.role);
    if (res.user.organization_id) {
      localStorage.setItem('sports_saas_demo_org_id', res.user.organization_id);
    } else {
      localStorage.removeItem('sports_saas_demo_org_id');
    }
    setToken(res.token);
    setUser(res.user);
    setOrganization(res.organization || null);
    setRole(res.user.role);
    return { user: res.user, organization: res.organization || null };
  };

  /**
   * Back to the super admin's own session. The borrowed token is signed out
   * only after the switch, so nothing still using it can take the admin's
   * session down with it. With no admin session to return to, this signs out.
   */
  const stopImpersonating = async () => {
    const borrowed = swapBackToImpersonator();
    if (!borrowed) {
      logout();
      return;
    }
    revokeToken(borrowed);
    setToken(localStorage.getItem(TOKEN_KEY));
    setUser(null);
    setOrganization(null);
    await fetchCurrentUser();
  };

  /**
   * Take up a replacement token for the session already signed in.
   *
   * Changing a password revokes every token the account holds, including the
   * one that asked, so the server hands back a fresh one — without adopting
   * it, the next request would be rejected and the user signed out of the tab
   * they just used.
   */
  const adoptToken = (nextToken: string) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
  };

  /** Forget the signed-in session in this browser. */
  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(IMPERSONATOR_KEY);
    localStorage.removeItem('sports_saas_demo_role');
    localStorage.removeItem('sports_saas_demo_org_id');
    setUser(null);
    setOrganization(null);
    setToken(null);
    setRole('PUBLIC_USER');
  };

  const logout = () => {
    // Tell the server to stop honouring this token before letting go of it.
    // Forgetting it here only ends the session in this browser; anyone else
    // holding a copy could have used it until it expired on its own. Nothing
    // waits on the call — signing out must not depend on the network.
    if (localStorage.getItem(TOKEN_KEY)) {
      api.post('/auth/logout').catch(() => {});
    }

    clearSession();
  };

  /**
   * End every session on every device, then sign out here — for a lost phone
   * or a password someone else may have. The token used to ask is revoked
   * with the rest, so there is nothing left to sign out separately.
   */
  const logoutEverywhere = async () => {
    try {
      await api.post('/auth/logout-everywhere');
    } finally {
      clearSession();
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // A credential that stopped being good mid-session: sign out once and say so,
  // rather than letting every screen fail on its own.
  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const current = localStorage.getItem(TOKEN_KEY);
      // Ignore a rejection of a token this tab has already moved on from.
      if (!current || (detail.token && detail.token !== current)) return;
      // The account being looked through stopped working: go back to the
      // admin's own session rather than signing the admin out too.
      const borrowed = swapBackToImpersonator();
      if (borrowed) {
        revokeToken(borrowed);
        setToken(localStorage.getItem(TOKEN_KEY));
        setUser(null);
        setOrganization(null);
        fetchCurrentUser();
        toast.warning(`${detail.reason || 'That session ended.'} You are back in your admin account.`);
        return;
      }
      // The server already refuses this token, so there is nothing to revoke —
      // and posting /auth/logout here could revoke a newer one by mistake.
      clearSession();
      toast.warning(detail.reason || 'Please sign in again.');
    };

    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);

    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, [toast, fetchCurrentUser]);

  // Gateway connection status. Announcements are no longer broadcast
  // platform-wide; each one reaches only its own match's big screen.
  useEffect(() => {
    const wsUrl = websocketUrl();
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsWsConnected(true);
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
        };
      } catch (err) {
        setIsWsConnected(false);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        role,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        isWsConnected,
        // The server says whose session this is; stored keys can go stale.
        isImpersonating: !!user?.impersonated_by,
        login,
        registerOrg,
        impersonate,
        stopImpersonating,
        logout,
        logoutEverywhere,
        adoptToken,
        refreshProfile: fetchCurrentUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
