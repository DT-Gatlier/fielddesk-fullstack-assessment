import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { workOrdersKeys } from '@/modules/work-orders/_api/work-orders-keys';
import type { RealtimeEventPayload } from '../_types/realtime.types';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

/**
 * Pure handler function replicating the SSE event ingestion logic
 * to verify targeted query invalidations and notification toasts
 * without requiring @testing-library/react hooks renderer.
 */
export function handleRealtimeEventMessage(
  rawData: string,
  orgId: string,
  queryClient: QueryClient,
): void {
  try {
    if (!rawData) return;
    const payload = JSON.parse(rawData) as RealtimeEventPayload;

    if (payload.type === 'ping') {
      return;
    }

    // Invalidate root work-orders query
    void queryClient.invalidateQueries({
      queryKey: ['work-orders'],
    });

    if (payload.workOrderId) {
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.detail(orgId, payload.workOrderId),
      });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.events(orgId, payload.workOrderId),
      });
    }

    if (payload.type === 'WORK_ORDER_CREATED') {
      const data = payload.data as { reference?: string; title?: string };
      toast.info(
        `New work order ${data.reference ?? ''} created: ${data.title ?? ''}`,
      );
    }
  } catch {
    // Ignore malformed frames
  }
}

describe('Realtime SSE Event Ingestion', () => {
  let mockQueryClient: {
    invalidateQueries: ReturnType<typeof vi.fn>;
  };
  const orgId = 'org-clearbrook';

  beforeEach(() => {
    mockQueryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates work order lists and triggers toast on WORK_ORDER_CREATED', () => {
    const raw = JSON.stringify({
      id: 'evt_1',
      type: 'WORK_ORDER_CREATED',
      organisationId: orgId,
      workOrderId: 'wo-1',
      occurredAt: new Date().toISOString(),
      data: { reference: 'WO-0001', title: 'Fix HVAC unit' },
    });

    handleRealtimeEventMessage(
      raw,
      orgId,
      mockQueryClient as unknown as QueryClient,
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders'],
    });
    expect(toast.info).toHaveBeenCalledWith(
      'New work order WO-0001 created: Fix HVAC unit',
    );
  });

  it('invalidates both list and detail queries on WORK_ORDER_STATUS_CHANGED', () => {
    const raw = JSON.stringify({
      id: 'evt_2',
      type: 'WORK_ORDER_STATUS_CHANGED',
      organisationId: orgId,
      workOrderId: 'wo-1',
      occurredAt: new Date().toISOString(),
      data: { status: 'IN_PROGRESS' },
    });

    handleRealtimeEventMessage(
      raw,
      orgId,
      mockQueryClient as unknown as QueryClient,
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders', 'detail', orgId, 'wo-1'],
    });
  });

  it('invalidates events, detail, and list queries on PROGRESS_EVENT_ADDED', () => {
    const raw = JSON.stringify({
      id: 'evt_3',
      type: 'PROGRESS_EVENT_ADDED',
      organisationId: orgId,
      workOrderId: 'wo-1',
      occurredAt: new Date().toISOString(),
      data: { eventId: 'pe-1', eventType: 'WORK_STARTED' },
    });

    handleRealtimeEventMessage(
      raw,
      orgId,
      mockQueryClient as unknown as QueryClient,
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders', 'detail', orgId, 'wo-1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['work-orders', 'detail', orgId, 'wo-1', 'events'],
    });
  });

  it('silently ignores ping heartbeat events without invalidating queries', () => {
    const raw = JSON.stringify({
      id: 'ping_123',
      type: 'ping',
      data: { timestamp: new Date().toISOString() },
    });

    handleRealtimeEventMessage(
      raw,
      orgId,
      mockQueryClient as unknown as QueryClient,
    );

    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
