import { apiClient } from '@/api/client';
import type { WorkOrderEventResDto, WorkOrderListResDto, WorkOrderResDto } from './api.types';
import type { WorkOrdersListParams } from './work-orders-keys';

export async function getWorkOrders(
  params: WorkOrdersListParams,
  signal?: AbortSignal,
): Promise<WorkOrderListResDto> {
  const { data, error } = await apiClient().GET('/api/v1/work-orders', {
    params: {
      query: {
        status: params.status,
        priority: params.priority,
        assignedTechnicianId: params.assignedTechnicianId,
        search: params.search,
        page: params.page,
        limit: params.limit,
      },
    },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load work orders');
  }
  return data;
}

export async function getWorkOrderById(
  id: string,
  signal?: AbortSignal,
): Promise<WorkOrderResDto> {
  const { data, error } = await apiClient().GET('/api/v1/work-orders/{id}', {
    params: { path: { id } },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load work order');
  }
  return data;
}

export async function getWorkOrderEvents(
  id: string,
  signal?: AbortSignal,
): Promise<WorkOrderEventResDto[]> {
  const { data, error } = await apiClient().GET('/api/v1/work-orders/{id}/events', {
    params: { path: { id } },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load work order activity history');
  }
  return data;
}

export async function getWorkOrderAttachments(
  id: string,
  signal?: AbortSignal,
): Promise<import('./api.types').AttachmentResDto[]> {
  const { data, error } = await apiClient().GET('/api/v1/work-orders/{id}/attachments', {
    params: { path: { id } },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load work order attachments');
  }
  return data;
}

export async function getOrganisationStorageUsage(
  signal?: AbortSignal,
): Promise<import('./api.types').StorageUsageResDto> {
  const { data, error } = await apiClient().GET('/api/v1/organisation/storage-usage', {
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load storage quota usage');
  }
  return data;
}
