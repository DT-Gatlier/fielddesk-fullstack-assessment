import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api/client';
import type { User } from './api/types';
import { useAuth } from './auth';

/** Active technicians, for assignment pickers and filters. Only fetched for roles allowed to list users. */
export function useTechnicians() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: () => api<{ data: User[] }>('/users?role=technician&active=true').then((r) => r.data),
    enabled: can('users:read'),
    staleTime: 60_000,
  });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
