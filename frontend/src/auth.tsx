import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError, onUnauthorized } from './api/client';
import type { Me } from './api/types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  /** UI convenience only; every action is re-checked by the API. */
  can: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ data: Me }>('/auth/me')).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(
    () => onUnauthorized(() => {
      qc.setQueryData(['me'], null);
    }),
    [qc],
  );

  const me = meQuery.data ?? null;
  const value: AuthState = {
    me,
    loading: meQuery.isLoading,
    can: (p) => !!me?.permissions.includes(p),
    async login(email, password) {
      const res = await api<{ data: Me }>('/auth/login', { method: 'POST', json: { email, password } });
      // Drop any data cached for a previous user, but keep the 'me' query
      // itself so its observer sees the new identity.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      qc.setQueryData(['me'], res.data);
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
