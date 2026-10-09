'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/modules/auth/hooks/use-session';
import { workOrdersKeys } from '@/modules/work-orders/_api/work-orders-keys';
import type {
  ConnectionStatus,
  RealtimeEventPayload,
} from '../_types/realtime.types';

export function useRealtimeEvents(): { status: ConnectionStatus } {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  const user = session.data;
  const orgId = user?.organisation.id;

  useEffect(() => {
    // Only connect when an authenticated user session is active
    if (!orgId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const streamUrl = `${apiBase}/api/v1/realtime/stream`;

    const es = new EventSource(streamUrl, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    es.onerror = () => {
      // EventSource automatically enters reconnection loop
      setStatus('reconnecting');
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const payload = JSON.parse(event.data) as RealtimeEventPayload;

        // Skip internal keep-alive heartbeats
        if (payload.type === 'ping') {
          return;
        }

        // Broad invalidation on work-orders root key ensures all list filters and details update
        void queryClient.invalidateQueries({
          queryKey: ['work-orders'],
        });

        // Invalidate notifications key so unread badges and dropdown sync instantly
        void queryClient.invalidateQueries({
          queryKey: ['notifications'],
        });

        // Targeted invalidations for specific views
        if (payload.workOrderId) {
          void queryClient.invalidateQueries({
            queryKey: workOrdersKeys.detail(orgId, payload.workOrderId),
          });
          void queryClient.invalidateQueries({
            queryKey: workOrdersKeys.events(orgId, payload.workOrderId),
          });
          void queryClient.invalidateQueries({
            queryKey: workOrdersKeys.attachments(orgId, payload.workOrderId),
          });
        }

        // Real-time storage quota bar invalidation
        if (
          payload.type === 'ATTACHMENT_ADDED' ||
          payload.type === 'ATTACHMENT_DELETED'
        ) {
          void queryClient.invalidateQueries({
            queryKey: workOrdersKeys.storageUsage(orgId),
          });
        }

        // Notify active work order views of unassignment
        if (payload.type === 'WORK_ORDER_UNASSIGNED' && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('work-order-unassigned', {
              detail: {
                workOrderId: payload.workOrderId,
                reference: payload.reference,
                assignedTechnicianId: payload.assignedTechnicianId,
              },
            }),
          );
        }

        // Emit general realtime event for in-app notification center
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('fielddesk-realtime-event', {
              detail: payload,
            }),
          );
        }

        // Show toast notification for new creations
        if (payload.type === 'WORK_ORDER_CREATED') {
          const data = payload.data as { reference?: string; title?: string };
          toast.info(
            `New work order ${data.reference ?? ''} created: ${data.title ?? ''}`,
          );
        }

        if (payload.type === 'ATTACHMENT_ADDED') {
          const data = payload.data as { originalFileName?: string };
          toast.info(
            `New attachment uploaded: ${data.originalFileName ?? 'file'}`,
          );
        }
      } catch {
        // Ignore unparseable frames safely
      }
    };

    // W3C SSE standard: register listeners for named event types AND default message
    const eventTypes = [
      'WORK_ORDER_CREATED',
      'WORK_ORDER_UPDATED',
      'WORK_ORDER_ASSIGNED',
      'WORK_ORDER_UNASSIGNED',
      'WORK_ORDER_STATUS_CHANGED',
      'PROGRESS_EVENT_ADDED',
      'ATTACHMENT_ADDED',
      'ATTACHMENT_DELETED',
    ];

    eventTypes.forEach((type) => {
      es.addEventListener(type, handleMessage as EventListener);
    });
    es.onmessage = handleMessage;

    return () => {
      eventTypes.forEach((type) => {
        es.removeEventListener(type, handleMessage as EventListener);
      });
      es.close();
      eventSourceRef.current = null;
      setStatus('disconnected');
    };
  }, [orgId, queryClient]);

  return { status };
}
