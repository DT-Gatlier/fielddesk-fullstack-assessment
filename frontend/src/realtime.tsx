import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'degraded' | 'unavailable';

export interface LiveEvent {
  type: string;
  workOrderId: string;
  reference?: string;
  status?: string;
  at: string;
}

interface RealtimeState {
  state: LiveState;
  recent: LiveEvent[];
  /** Polling interval used by queries while live delivery is not working. */
  fallbackInterval: number | false;
}

const RealtimeContext = createContext<RealtimeState>({ state: 'unavailable', recent: [], fallbackInterval: 30_000 });

/**
 * Subscribes to /api/realtime/stream (Server-Sent Events) and refetches the
 * affected queries when a work order changes. EventSource reconnects on its
 * own; after any reconnect we refetch everything, because events published
 * while disconnected are not replayed. While the stream is down the UI falls
 * back to polling every 30 s, so data is never more than that stale.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  const [recent, setRecent] = useState<LiveEvent[]>([]);
  const hadError = useRef(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setState('unavailable');
      return;
    }
    const es = new EventSource('/api/realtime/stream');

    es.addEventListener('ready', (e) => {
      const { realtime } = JSON.parse((e as MessageEvent).data);
      setState(realtime === 'ok' ? 'live' : 'degraded');
      if (hadError.current) {
        hadError.current = false;
        void qc.invalidateQueries(); // catch up on anything missed while disconnected
      }
    });
    es.addEventListener('status', (e) => {
      const { realtime } = JSON.parse((e as MessageEvent).data);
      if (realtime === 'ok') {
        setState('live');
        void qc.invalidateQueries();
      } else if (realtime === 'degraded') setState('degraded');
    });
    es.addEventListener('work_order', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as LiveEvent;
      setRecent((r) => [ev, ...r].slice(0, 20));
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void qc.invalidateQueries({ queryKey: ['work-order', ev.workOrderId] });
      void qc.invalidateQueries({ queryKey: ['activity', ev.workOrderId] });
    });
    es.addEventListener('session_expired', () => {
      es.close();
      qc.setQueryData(['me'], null);
    });
    es.onerror = () => {
      hadError.current = true;
      setState(es.readyState === EventSource.CLOSED ? 'unavailable' : 'reconnecting');
    };
    return () => es.close();
  }, [qc]);

  const fallbackInterval = state === 'live' ? false : 30_000;
  return <RealtimeContext.Provider value={{ state, recent, fallbackInterval }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);
