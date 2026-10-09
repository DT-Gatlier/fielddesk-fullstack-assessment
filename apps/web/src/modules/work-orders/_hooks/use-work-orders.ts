'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/modules/auth/hooks/use-session';
import type {
  AssignWorkOrderDto,
  CreateWorkOrderDto,
  SubmitProgressEventDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
} from '../_api/api.types';
import {
  assignWorkOrder,
  createWorkOrder,
  deleteAttachment,
  submitProgressEvent,
  updateWorkOrder,
  updateWorkOrderStatus,
  uploadAttachment,
} from '../_api/work-orders-mutations';
import {
  getOrganisationStorageUsage,
  getWorkOrderAttachments,
  getWorkOrderById,
  getWorkOrderEvents,
  getWorkOrders,
} from '../_api/work-orders-query';
import { workOrdersKeys, type WorkOrdersListParams } from '../_api/work-orders-keys';

export function useWorkOrders(params: WorkOrdersListParams) {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';

  return useQuery({
    queryKey: workOrdersKeys.list(orgId, params),
    queryFn: ({ signal }) => getWorkOrders(params, signal),
    enabled: Boolean(orgId),
  });
}

export function useWorkOrder(id: string) {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';

  return useQuery({
    queryKey: workOrdersKeys.detail(orgId, id),
    queryFn: ({ signal }) => getWorkOrderById(id, signal),
    enabled: Boolean(orgId && id),
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorkOrderDto) => createWorkOrder(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkOrderDto }) =>
      updateWorkOrder(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.details(),
      });
    },
  });
}

export function useAssignWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignWorkOrderDto }) =>
      assignWorkOrder(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.details(),
      });
    },
  });
}

export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkOrderStatusDto }) =>
      updateWorkOrderStatus(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workOrdersKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.details(),
      });
    },
  });
}

export function useWorkOrderEvents(workOrderId: string) {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';

  return useQuery({
    queryKey: workOrdersKeys.events(orgId, workOrderId),
    queryFn: ({ signal }) => getWorkOrderEvents(workOrderId, signal),
    enabled: Boolean(orgId && workOrderId),
  });
}

export function useSubmitProgressEvent() {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workOrderId,
      input,
    }: {
      workOrderId: string;
      input: SubmitProgressEventDto;
    }) => submitProgressEvent(workOrderId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.events(orgId, variables.workOrderId),
      });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.detail(orgId, variables.workOrderId),
      });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.lists(),
      });
    },
  });
}

export function useWorkOrderAttachments(workOrderId: string) {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';

  return useQuery({
    queryKey: workOrdersKeys.attachments(orgId, workOrderId),
    queryFn: ({ signal }) => getWorkOrderAttachments(workOrderId, signal),
    enabled: Boolean(orgId && workOrderId),
  });
}

export function useStorageUsage() {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';

  return useQuery({
    queryKey: workOrdersKeys.storageUsage(orgId),
    queryFn: ({ signal }) => getOrganisationStorageUsage(signal),
    enabled: Boolean(orgId),
  });
}

export function useUploadAttachment() {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workOrderId,
      file,
    }: {
      workOrderId: string;
      file: File;
    }) => uploadAttachment(workOrderId, file),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.attachments(orgId, variables.workOrderId),
      });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.storageUsage(orgId),
      });
    },
  });
}

export function useDeleteAttachment() {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workOrderId,
      attachmentId,
    }: {
      workOrderId: string;
      attachmentId: string;
    }) => deleteAttachment(workOrderId, attachmentId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.attachments(orgId, variables.workOrderId),
      });
      void queryClient.invalidateQueries({
        queryKey: workOrdersKeys.storageUsage(orgId),
      });
    },
  });
}

