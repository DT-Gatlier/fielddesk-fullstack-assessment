import type { RealtimeEventPayload } from '@/modules/realtime/_types/realtime.types';
import type { InAppNotification } from '../_types/notifications.types';

/**
 * Transforms incoming realtime domain event payloads into user-friendly,
 * concise notifications tailored to the current user's role and identity.
 */
export function formatRealtimeEvent(
  event: RealtimeEventPayload,
  userRole: string,
  currentUserId: string,
): InAppNotification {
  const ref = event.reference || 'Work order';
  const isAssignedToMe = event.assignedTechnicianId === currentUserId;

  let title = 'Work Order Update';
  let description = `${ref} was updated.`;

  switch (event.type) {
    case 'WORK_ORDER_ASSIGNED':
      if (userRole === 'TECHNICIAN' && isAssignedToMe) {
        title = 'New Assignment';
        description = `You were assigned to ${ref}.`;
      } else {
        title = 'Work Order Assigned';
        description = `${ref} has been assigned.`;
      }
      break;

    case 'WORK_ORDER_UNASSIGNED':
      if (userRole === 'TECHNICIAN' && isAssignedToMe) {
        title = 'Assignment Removed';
        description = `You were unassigned from ${ref}.`;
      } else {
        title = 'Technician Unassigned';
        description = `${ref} is now unassigned.`;
      }
      break;

    case 'PROGRESS_EVENT_ADDED':
      if (userRole === 'TECHNICIAN') {
        title = 'Progress Recorded';
        description = `Update for ${ref} was recorded.`;
      } else {
        title = 'Progress Updated';
        description = `Work progress recorded on ${ref}.`;
      }
      break;

    case 'WORK_ORDER_STATUS_CHANGED':
      title = 'Status Updated';
      description = `${ref} status has changed.`;
      break;

    case 'WORK_ORDER_CREATED':
      title = 'New Work Order';
      description = `${ref} was created.`;
      break;

    case 'ATTACHMENT_ADDED':
      title = 'Attachment Added';
      description = `A file was attached to ${ref}.`;
      break;

    case 'ATTACHMENT_DELETED':
      title = 'Attachment Removed';
      description = `A file was removed from ${ref}.`;
      break;

    default:
      title = 'Work Order Update';
      description = `${ref} was updated.`;
      break;
  }

  return {
    id: event.id,
    title,
    description,
    workOrderId: event.workOrderId,
    reference: event.reference,
    type: event.type,
    createdAt: event.occurredAt || new Date().toISOString(),
    isRead: false,
  };
}

/**
 * Returns a human-readable relative time string (e.g. "Just now", "5m ago").
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSeconds < 60) {
      return 'Just now';
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}
