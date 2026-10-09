'use client';
import { useContext } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthCommandsContext } from '../components/auth-provider';
export function useLogin() {
  const commands = useContext(AuthCommandsContext);
  if (!commands) throw new Error('useLogin requires AuthProvider');
  return useMutation({ mutationFn: commands.signIn });
}
