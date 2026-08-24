import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, Organization, UserRole, Announcement } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isWsConnected: boolean;
  latestAnnouncement: Announcement | null;
  login: (email: string, password: string) => Promise<{ user: User; organization: Organization | null }>;
  registerOrg: (data: any) => Promise<{ user: User; organization: Organization }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sports_saas_token'));
  const [role, setRole] = useState<UserRole>('PUBLIC_USER');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);

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
      localStorage.removeItem('sports_saas_demo_role');
      localStorage.removeItem('sports_saas_demo_org_id');
      setUser(null);
      setOrganization(null);
      setToken(null);
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

  const logout = () => {
    localStorage.removeItem('sports_saas_token');
    localStorage.removeItem('sports_saas_demo_role');
    localStorage.removeItem('sports_saas_demo_org_id');
    setUser(null);
    setOrganization(null);
    setToken(null);
    setRole('PUBLIC_USER');
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // WebSocket Global Connection for live updates and emergency alerts
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'EMERGENCY_ANNOUNCEMENT') {
              setLatestAnnouncement(data.payload?.announcement || null);
            }
          } catch (e) {
            // ignore non-json
          }
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
        latestAnnouncement,
        login,
        registerOrg,
        logout,
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
