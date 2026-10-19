import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

const RealtimeContext = createContext<RealtimeStatus>('offline');

/** How often lists refresh while the live connection is down. */
export const OFFLINE_POLL_MS = 30_000;

/**
 * Keeps a WebSocket open while signed in. Messages are change hints: they invalidate cached queries,
 * which refetch through the REST API. On disconnect it reconnects with capped exponential backoff and
 * jitter; after reconnecting it refetches everything, since events sent while offline were missed.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('offline');

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      setStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/api/realtime`);

      socket.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as { type: string; workOrderId?: string };
        if (event.type === 'connected') {
          if (attempt > 0) void queryClient.invalidateQueries();
          attempt = 0;
          setStatus('live');
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        if (event.workOrderId) void queryClient.invalidateQueries({ queryKey: ['work-order', event.workOrderId] });
      };

      socket.onclose = (close) => {
        setStatus('offline');
        if (stopped) return;
        // 4401: the server ended the session. Re-check it; the auth layer handles a real logout.
        if (close.code === 4401) void queryClient.invalidateQueries({ queryKey: ['me'] });
        attempt += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random() / 2);
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [enabled, queryClient]);

  return <RealtimeContext.Provider value={status}>{children}</RealtimeContext.Provider>;
}

export const useRealtimeStatus = () => useContext(RealtimeContext);

/** Poll only while the live connection is unavailable. */
export const useFallbackPolling = () => (useRealtimeStatus() === 'live' ? false : OFFLINE_POLL_MS);
