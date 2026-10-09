'use client';
import { useEffect, type RefObject } from 'react';

export function useAuthSignals(
  channelRef: RefObject<BroadcastChannel | null>,
  refresh: () => Promise<void>,
) {
  useEffect(() => {
    const onChange = () => {
      void refresh();
    };
    window.addEventListener('fielddesk:unauthorized', onChange);
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel('fielddesk-auth');
      channelRef.current.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'changed') onChange();
      };
    }
    return () => {
      window.removeEventListener('fielddesk:unauthorized', onChange);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [channelRef, refresh]);
}
