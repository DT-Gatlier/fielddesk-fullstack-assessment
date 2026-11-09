import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile } from '../types/auth.types';
import { loginApi, logoutApi, refreshApi, getMeApi } from '../api/auth.api';
import { setTokens, getStoredRefreshToken, registerSessionExpiredHandler } from '../../../lib/api-client';

export interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleSessionExpired = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setTokens(null, null);
    if (!window.location.search.includes('session_expired=true')) {
      window.history.replaceState(null, '', '/login?session_expired=true');
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const stored = getStoredRefreshToken();
    if (!stored) {
      setUser(null);
      setAccessToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await refreshApi(stored);
      setAccessToken(res.accessToken);
      setTokens(res.accessToken, res.refreshToken);

      const me = await getMeApi();
      setUser(me.user);
    } catch {
      handleSessionExpired();
    } finally {
      setIsLoading(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    registerSessionExpiredHandler(handleSessionExpired);
    refreshSession();
  }, [handleSessionExpired, refreshSession]);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await loginApi(email, password);
      setAccessToken(res.accessToken);
      setUser(res.user);
      setTokens(res.accessToken, res.refreshToken);
      window.history.replaceState(null, '', '/');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await logoutApi();
    } catch {
      // Even if network fails, clear local tokens
    } finally {
      setUser(null);
      setAccessToken(null);
      setTokens(null, null);
      window.history.replaceState(null, '', '/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

