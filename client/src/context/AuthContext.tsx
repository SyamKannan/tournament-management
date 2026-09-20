import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Organization, UserRole } from '../types';
import { api, SESSION_ENDED_EVENT } from '../services/api';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sports_saas_token'));
  const [isImpersonating, setIsImpersonating] = useState<boolean>(() => !!localStorage.getItem('sports_saas_impersonator_token'));
  const [role, setRole] = useState<UserRole>('PUBLIC_USER');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  const fetchCurrentUser = useCallback(async () => {
    const storedToken = localStorage.getItem('sports_saas_token');
    if (!storedToken) {
      setUser(null);
      setOrganization(null);
      setRole('PUBLIC_USER');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.get('/auth/me');
      setUser(res.user);
      setOrganization(res.organization);
      if (res.user?.role) {
        setRole(res.user.role);
      }
    } catch (err) {
      console.warn('Session expired or invalid, logging out');
      localStorage.removeItem('sports_saas_token');
      localStorage.removeItem('sports_saas_impersonator_token');
      localStorage.removeItem('sports_saas_demo_role');
      localStorage.removeItem('sports_saas_demo_org_id');
      setUser(null);
      setOrganization(null);
      setToken(null);
      setIsImpersonating(false);
      setRole('PUBLIC_USER');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.token) {
        localStorage.setItem('sports_saas_token', res.token);
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
        localStorage.setItem('sports_saas_token', res.token);
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
    try {
      const currentToken = localStorage.getItem('sports_saas_token');
      if (!localStorage.getItem('sports_saas_impersonator_token') && currentToken) {
        localStorage.setItem('sports_saas_impersonator_token', currentToken);
      }

      const res = await api.post('/admin/impersonate', {
        user_id: options.userId,
        organization_id: options.organizationId,
      });

      if (res.token) {
        localStorage.setItem('sports_saas_token', res.token);
        localStorage.setItem('sports_saas_demo_role', res.user.role);
        if (res.user.organization_id) {
          localStorage.setItem('sports_saas_demo_org_id', res.user.organization_id);
        }
        setToken(res.token);
        setUser(res.user);
        setOrganization(res.organization || null);
        setRole(res.user.role);
        setIsImpersonating(true);
        return { user: res.user, organization: res.organization || null };
      }
      throw new Error('Impersonation failed to return a valid token');
    } finally {
      setIsLoading(false);
    }
  };

  const stopImpersonating = async () => {
    setIsLoading(true);
    try {
      const originalToken = localStorage.getItem('sports_saas_impersonator_token');
      if (originalToken) {
        // Kill the impersonation token while it is still the one being sent.
        // It stood for someone else's account, so it must not outlive the
        // session that borrowed it; the super admin's own token is a separate
        // token and is untouched by this.
        await api.post('/auth/logout').catch(() => {});

        localStorage.setItem('sports_saas_token', originalToken);
        localStorage.removeItem('sports_saas_impersonator_token');
        localStorage.removeItem('sports_saas_demo_role');
        localStorage.removeItem('sports_saas_demo_org_id');
        setIsImpersonating(false);
        setToken(originalToken);

        const res = await api.get('/auth/me');
        setUser(res.user);
        setOrganization(res.organization || null);
        setRole(res.user.role);
      }
    } catch (err) {
      console.error('Failed to stop impersonation cleanly', err);
      fetchCurrentUser();
    } finally {
      setIsLoading(false);
    }
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
    localStorage.setItem('sports_saas_token', nextToken);
    setToken(nextToken);
  };

  /** Forget the signed-in session in this browser. */
  const clearSession = () => {
    localStorage.removeItem('sports_saas_token');
    localStorage.removeItem('sports_saas_impersonator_token');
    localStorage.removeItem('sports_saas_demo_role');
    localStorage.removeItem('sports_saas_demo_org_id');
    setIsImpersonating(false);
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
    if (localStorage.getItem('sports_saas_token')) {
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
      if (!localStorage.getItem('sports_saas_token')) return;
      logout();
      toast.warning((event as CustomEvent).detail?.reason || 'Please sign in again.');
    };

    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);

    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, [toast]);

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
        isImpersonating,
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
