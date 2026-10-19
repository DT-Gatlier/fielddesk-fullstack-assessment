import type { Redis } from 'ioredis';

export const ORG_CHANNEL_PREFIX = 'fielddesk:org:';

/**
 * Real-time messages are change notifications, not data: they carry ids and the fields needed for
 * routing. Clients re-fetch through the REST API, which applies the full authorisation rules.
 */
export interface RealtimeEvent {
  type: 'work_order.created' | 'work_order.updated' | 'attachment.added' | 'notification.updated';
  workOrderId: string;
  reference?: string;
  status?: string;
  assignedTechnicianId: string | null;
  previousTechnicianId?: string | null;
  at: string;
}

export function realtimeEvent(
  type: RealtimeEvent['type'],
  workOrder: { id: string; reference: string; status: string; assigned_technician_id: string | null },
  previousTechnicianId?: string | null,
): RealtimeEvent {
  return {
    type,
    workOrderId: workOrder.id,
    reference: workOrder.reference,
    status: workOrder.status,
    assignedTechnicianId: workOrder.assigned_technician_id,
    ...(previousTechnicianId !== undefined && previousTechnicianId !== workOrder.assigned_technician_id
      ? { previousTechnicianId }
      : {}),
    at: new Date().toISOString(),
  };
}

/**
 * Publishes through Redis so every API instance receives it and forwards it to its own sockets.
 * The channel name carries the organisation, so delivery is partitioned by tenant.
 */
export async function publishOrgEvent(redis: Redis, orgId: string, event: RealtimeEvent): Promise<void> {
  await redis.publish(`${ORG_CHANNEL_PREFIX}${orgId}`, JSON.stringify(event));
}
