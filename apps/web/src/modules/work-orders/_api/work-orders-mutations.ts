import { getApiUrl } from '@/lib/env';
import { apiClient } from '@/api/client';
import { assertAuthEpoch, authEpoch, getCsrf } from '@/modules/auth/api/auth-transport';
import type {
  AssignWorkOrderDto,
  CreateWorkOrderDto,
  SubmitProgressEventDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
  WorkOrderEventResDto,
  WorkOrderResDto,
} from './api.types';

export async function createWorkOrder(input: CreateWorkOrderDto): Promise<WorkOrderResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().POST('/api/v1/work-orders', {
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to create work order');
  }
  return data;
}

export async function updateWorkOrder(id: string, input: UpdateWorkOrderDto): Promise<WorkOrderResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().PATCH('/api/v1/work-orders/{id}', {
    params: { path: { id } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to update work order');
  }
  return data;
}

export async function assignWorkOrder(id: string, input: AssignWorkOrderDto): Promise<WorkOrderResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().POST('/api/v1/work-orders/{id}/assign', {
    params: { path: { id } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to assign work order');
  }
  return data;
}

export async function updateWorkOrderStatus(id: string, input: UpdateWorkOrderStatusDto): Promise<WorkOrderResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().POST('/api/v1/work-orders/{id}/status', {
    params: { path: { id } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to update work order status');
  }
  return data;
}

export async function submitProgressEvent(
  id: string,
  input: SubmitProgressEventDto,
): Promise<WorkOrderEventResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().POST('/api/v1/work-orders/{id}/events', {
    params: { path: { id } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to submit progress event');
  }
  return data;
}

export async function uploadAttachment(
  id: string,
  file: File,
): Promise<import('./api.types').AttachmentResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${getApiUrl()}/api/v1/work-orders/${id}/attachments`, {
    method: 'POST',
    body: formData,
    headers: {
      'X-CSRF-Token': csrf,
    },
    credentials: 'include',
  });

  assertAuthEpoch(expected);

  if (!response.ok) {
    let errorMessage = 'Failed to upload attachment';
    try {
      const errJson = await response.json();
      if (errJson && typeof errJson.message === 'string') {
        errorMessage = errJson.message;
      }
    } catch {
      // Use status text if json fails
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function deleteAttachment(
  workOrderId: string,
  attachmentId: string,
): Promise<void> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { error } = await apiClient().DELETE(
    '/api/v1/work-orders/{id}/attachments/{attachmentId}',
    {
      params: { path: { id: workOrderId, attachmentId } },
      headers: { 'X-CSRF-Token': csrf },
    },
  );
  assertAuthEpoch(expected);
  if (error) {
    throw error || new Error('Failed to delete attachment');
  }
}
