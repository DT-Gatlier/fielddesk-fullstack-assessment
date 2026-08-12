import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, configureAuth } from '../api/client';
import type { ApiResponse, User } from '../types';

interface AuthValue {
  user: User | null;
  booting: boolean;
  login: (credentials: { organisation: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const clear = useCallback(() => { configureAuth(null); setUser(null); }, []);

  useEffect(() => {
    configureAuth(null, clear);
    apiFetch<ApiResponse<{ accessToken: string }>>('/auth/refresh', { method: 'POST', body: '{}' }, false)
      .then((result) => { configureAuth(result.data.accessToken, clear); return apiFetch<ApiResponse<User>>('/auth/me'); })
      .then((result) => setUser(result.data))
      .catch(clear)
      .finally(() => setBooting(false));
  }, [clear]);

  const login = useCallback(async (credentials: { organisation: string; email: string; password: string }) => {
    const result = await apiFetch<ApiResponse<{ accessToken: string; user: User }>>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }, false);
    configureAuth(result.data.accessToken, clear);
    const profile = await apiFetch<ApiResponse<User>>('/auth/me');
    setUser(profile.data);
  }, [clear]);

  const logout = useCallback(async () => {
    try { await apiFetch<void>('/auth/logout', { method: 'POST' }); } finally { clear(); }
  }, [clear]);

  const value = useMemo(() => ({ user, booting, login, logout }), [user, booting, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and hook intentionally live together as one authentication module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
