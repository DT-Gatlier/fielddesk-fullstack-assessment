'use client';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getCsrf } from '../api/auth-transport';
import { getSession } from '../api/auth-query';
import { login, logout } from '../api/auth-mutations';
import type { LoginDto } from '../api/api.types';
import { authKeys } from '../api/auth-keys';
import { clearAuthState } from '../api/session-cache';
import { dismissAuthNotifications } from '../utils/auth-notifications';

export function useAuthTransitions(
  busyRef: RefObject<boolean>,
  channelRef: RefObject<BroadcastChannel | null>,
) {
  const client = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [identityVersion, setIdentityVersion] = useState(0);
  const queuedSignalRef = useRef(false);
  const refresh = useCallback(async () => {
    // Serialize signals behind cookie mutations; never lose a cross-tab change.
    if (busyRef.current) {
      queuedSignalRef.current = true;
      return;
    }
    busyRef.current = true;
    setChanging(true);
    dismissAuthNotifications();
    try {
      do {
        queuedSignalRef.current = false;
        await clearAuthState(client);
        await client.fetchQuery({
          queryKey: authKeys.session,
          queryFn: ({ signal }) => getSession(signal),
        });
        setIdentityVersion((value) => value + 1);
      } while (queuedSignalRef.current);
    } catch {
      /* Session errors are presented by the boundary. */
    } finally {
      busyRef.current = false;
      setChanging(false);
    }
  }, [client, busyRef]);
  const change = useCallback(
    async (operation: () => Promise<void>, signedIn: boolean) => {
      if (busyRef.current)
        throw new Error('An authentication change is already running');
      busyRef.current = true;
      setChanging(true);
      dismissAuthNotifications();
      try {
        await client.cancelQueries();
        await operation();
        await clearAuthState(client);
        setIdentityVersion((value) => value + 1);
        channelRef.current?.postMessage('changed');
        if (signedIn) {
          await getCsrf();
          const user = await client.fetchQuery({
            queryKey: authKeys.session,
            queryFn: ({ signal }) => getSession(signal),
          });
          if (!user) throw new Error('The new session could not be loaded');
        } else client.setQueryData(authKeys.session, null);
      } finally {
        busyRef.current = false;
        if (queuedSignalRef.current) await refresh();
        else setChanging(false);
      }
    },
    [client, busyRef, channelRef, refresh],
  );
  const signIn = useCallback(
    (input: LoginDto) => change(() => login(input), true),
    [change],
  );
  const signOut = useCallback(() => change(logout, false), [change]);
  return { changing, identityVersion, signIn, signOut, refresh };
}
