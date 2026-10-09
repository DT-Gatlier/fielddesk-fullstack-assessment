'use client';
import { useContext } from 'react';
import { SessionContext } from '../components/auth-provider';
export function useSession() {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession requires AuthProvider');
  return state;
}
