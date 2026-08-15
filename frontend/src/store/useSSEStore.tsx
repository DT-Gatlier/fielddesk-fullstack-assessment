import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SSEState {
  status: ConnectionStatus;
  lastUpdate: Date | null;
  setStatus: (status: ConnectionStatus) => void;
  setLastUpdate: (date: Date) => void;
}

export const useSSEStore = create<SSEState>((set) => ({
  status: 'disconnected',
  lastUpdate: null,
  setStatus: (status) => set({ status }),
  setLastUpdate: (date) => set({ lastUpdate: date }),
}));

export const SSEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const setStatus = useSSEStore((state) => state.setStatus);
  const setLastUpdate = useSSEStore((state) => state.setLastUpdate);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    setStatus('connecting');
    const eventSource = new EventSource(`http://localhost:3000/api/sse/events?token=${token}`);

    eventSource.onopen = () => {
      setStatus('connected');
    };

    eventSource.addEventListener('work_order_created', () => {
      setLastUpdate(new Date());
    });

    eventSource.addEventListener('work_order_updated', () => {
      setLastUpdate(new Date());
    });

    eventSource.onerror = () => {
      setStatus('disconnected');
      // EventSource handles reconnection automatically
    };

    // Degraded-mode fallback polling
    const pollingInterval = setInterval(() => {
      const currentStatus = useSSEStore.getState().status;
      if (currentStatus === 'disconnected') {
        // Force a data refresh when disconnected to act as a fallback
        useSSEStore.getState().setLastUpdate(new Date());
      }
    }, 30000); // 30 seconds

    return () => {
      eventSource.close();
      clearInterval(pollingInterval);
      setStatus('disconnected');
    };
  }, [user, setStatus, setLastUpdate]);

  return <React.Fragment>{children}</React.Fragment>;
};
