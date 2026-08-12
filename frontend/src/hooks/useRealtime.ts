import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL, getAccessToken } from '../api/client';

export function useRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let reconnectTimer: number | undefined;

    async function connect() {
      const token = getAccessToken();
      if (!token || controller.signal.aborted) return;
      setState((current) => current === 'connected' ? 'reconnecting' : current);
      try {
        const response = await fetch(`${API_URL}/events/stream`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: controller.signal, credentials: 'include' });
        if (!response.ok || !response.body) throw new Error('Realtime unavailable');
        setState('connected');
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() ?? '';
          for (const message of messages) {
            if (message.includes('event: work_order.') || message.includes('event: attachment.')) {
              void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
              void queryClient.invalidateQueries({ queryKey: ['work-order'] });
              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            }
          }
        }
        if (!controller.signal.aborted) throw new Error('Realtime disconnected');
      } catch {
        if (!controller.signal.aborted) {
          setState('reconnecting');
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      }
    }
    void connect();
    return () => { controller.abort(); window.clearTimeout(reconnectTimer); };
  }, [enabled, queryClient]);

  return state;
}
