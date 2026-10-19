import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError, UNAUTHENTICATED_EVENT, type CurrentUser, type Role } from './api';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** For showing or hiding UI only. The API enforces every permission itself. */
  can(...roles: Role[]): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: CurrentUser }>('/api/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  // Switches the signed-in user. Cached data from the previous session is dropped, but the ['me']
  // query itself is kept: removing it would orphan the component observing it, leaving the app
  // stuck on the loading screen.
  const setSession = useCallback(
    (next: CurrentUser | null) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      queryClient.setQueryData(['me'], next);
    },
    [queryClient],
  );

  // Any 401 from the API (expired or revoked session) returns the app to the login screen.
  useEffect(() => {
    const onUnauthenticated = () => setSession(null);
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, [setSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api<{ user: CurrentUser }>('/api/auth/login', { json: { email, password } });
      setSession(user);
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  }, [setSession]);

  const user = me.data ?? null;
  const can = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  return <AuthContext.Provider value={{ user, loading: me.isLoading, login, logout, can }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
