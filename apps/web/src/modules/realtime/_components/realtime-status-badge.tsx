'use client';

import { Radio } from 'lucide-react';
import type { ConnectionStatus } from '../_types/realtime.types';

interface RealtimeStatusBadgeProps {
  status: ConnectionStatus;
}

export function RealtimeStatusBadge({ status }: RealtimeStatusBadgeProps) {
  if (status === 'disconnected') {
    return null;
  }

  const isConnected = status === 'connected';

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition-colors"
      title={
        isConnected
          ? 'Real-time updates active. Dashboard and work orders sync live without manual refresh.'
          : 'Reconnecting to real-time service…'
      }
    >
      <span className="relative flex size-2 items-center justify-center">
        {isConnected ? (
          <>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </>
        ) : (
          <>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          </>
        )}
      </span>
      <Radio className="size-3 text-muted-foreground" aria-hidden="true" />
      <span className={isConnected ? 'text-foreground' : 'text-amber-500 font-normal'}>
        {isConnected ? 'Live' : 'Reconnecting'}
      </span>
    </div>
  );
}
