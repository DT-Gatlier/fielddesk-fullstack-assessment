import { describe, expect, it } from 'vitest';
import type { RealtimeEventPayload } from '@/modules/realtime/_types/realtime.types';
import {
  formatRealtimeEvent,
  formatRelativeTime,
} from './notification-formatter';

describe('notification-formatter', () => {
  it('formats WORK_ORDER_ASSIGNED for technician when assigned to self', () => {
    const event: RealtimeEventPayload = {
      id: 'evt-1',
      type: 'WORK_ORDER_ASSIGNED',
      organisationId: 'org-1',
      workOrderId: 'wo-101',
      reference: 'WO-0004',
      assignedTechnicianId: 'tech-user-1',
      occurredAt: '2026-10-09T08:00:00Z',
      data: {},
    };

    const notification = formatRealtimeEvent(event, 'TECHNICIAN', 'tech-user-1');

    expect(notification.title).toBe('New Assignment');
    expect(notification.description).toBe('You were assigned to WO-0004.');
    expect(notification.reference).toBe('WO-0004');
    expect(notification.isRead).toBe(false);
  });

  it('formats WORK_ORDER_ASSIGNED for owner/dispatcher', () => {
    const event: RealtimeEventPayload = {
      id: 'evt-2',
      type: 'WORK_ORDER_ASSIGNED',
      organisationId: 'org-1',
      workOrderId: 'wo-101',
      reference: 'WO-0004',
      assignedTechnicianId: 'tech-user-1',
      occurredAt: '2026-10-09T08:00:00Z',
      data: {},
    };

    const notification = formatRealtimeEvent(event, 'OWNER', 'owner-user-1');

    expect(notification.title).toBe('Work Order Assigned');
    expect(notification.description).toBe('WO-0004 has been assigned.');
  });

  it('formats WORK_ORDER_UNASSIGNED for technician when unassigned', () => {
    const event: RealtimeEventPayload = {
      id: 'evt-3',
      type: 'WORK_ORDER_UNASSIGNED',
      organisationId: 'org-1',
      workOrderId: 'wo-101',
      reference: 'WO-0004',
      assignedTechnicianId: 'tech-user-1',
      occurredAt: '2026-10-09T08:00:00Z',
      data: {},
    };

    const notification = formatRealtimeEvent(event, 'TECHNICIAN', 'tech-user-1');

    expect(notification.title).toBe('Assignment Removed');
    expect(notification.description).toBe('You were unassigned from WO-0004.');
  });

  it('formats PROGRESS_EVENT_ADDED appropriately for owner vs technician', () => {
    const event: RealtimeEventPayload = {
      id: 'evt-4',
      type: 'PROGRESS_EVENT_ADDED',
      organisationId: 'org-1',
      workOrderId: 'wo-101',
      reference: 'WO-0004',
      occurredAt: '2026-10-09T08:00:00Z',
      data: {},
    };

    const ownerNotif = formatRealtimeEvent(event, 'OWNER', 'owner-1');
    expect(ownerNotif.title).toBe('Progress Updated');
    expect(ownerNotif.description).toBe('Work progress recorded on WO-0004.');

    const techNotif = formatRealtimeEvent(event, 'TECHNICIAN', 'tech-1');
    expect(techNotif.title).toBe('Progress Recorded');
    expect(techNotif.description).toBe('Update for WO-0004 was recorded.');
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for recent timestamps', () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe('Just now');
    });

    it('returns "10m ago" for 10 minutes past', () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(formatRelativeTime(tenMinsAgo)).toBe('10m ago');
    });

    it('returns "2h ago" for 2 hours past', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
    });

    it('returns "3d ago" for 3 days past', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
    });
  });
});
