'use client';
import { useContext } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthCommandsContext } from '../components/auth-provider';
import {
  dismissAuthNotifications,
  notifyAuthError,
} from '../utils/auth-notifications';
export function useLogout() {
  const commands = useContext(AuthCommandsContext);
  if (!commands) throw new Error('useLogout requires AuthProvider');
  return useMutation({
    mutationFn: commands.signOut,
    onMutate: dismissAuthNotifications,
    onError: (error) => notifyAuthError('logout', error),
  });
}
