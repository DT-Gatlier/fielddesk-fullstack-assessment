'use client';
import { useEffect, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { getSession } from '../api/auth-query';
import { authKeys } from '../api/auth-keys';
import { clearPrivateState } from '../api/session-cache';
import { dismissAuthNotifications } from '../utils/auth-notifications';

export function useSessionObserver(
  busy: RefObject<boolean>,
  changing: boolean,
) {
  const client = useQueryClient();
  const pathname = usePathname();
  const [checkedPath, setCheckedPath] = useState(pathname);
  const session = useQuery({
    queryKey: authKeys.session,
    queryFn: ({ signal }) => getSession(signal),
    refetchOnWindowFocus: () => !busy.current,
    refetchOnReconnect: () => !busy.current,
  });
  const { refetch } = session;
  useEffect(() => {
    // The query owns the initial read. Only navigation needs another check.
    if (checkedPath === pathname || busy.current) return;
    let active = true;
    void refetch().then(() => {
      if (active) setCheckedPath(pathname);
    });
    return () => {
      active = false;
    };
  }, [pathname, checkedPath, changing, busy, refetch]);
  useEffect(() => {
    // A transition already clears all private state. Do not rotate the transport
    // epoch underneath its new identity request when a focus check also expires.
    if (session.data === null && !busy.current) {
      dismissAuthNotifications();
      void clearPrivateState(client);
    }
  }, [session.data, busy, client]);
  return { session, checking: checkedPath !== pathname };
}
