import type { components } from '@/api/schema';

export type WorkOrderResDto = components['schemas']['WorkOrderResDto'];
export type WorkOrderListResDto = components['schemas']['WorkOrderListResDto'];
export type CreateWorkOrderDto = components['schemas']['CreateWorkOrderDto'];
export type UpdateWorkOrderDto = components['schemas']['UpdateWorkOrderDto'];
export type AssignWorkOrderDto = components['schemas']['AssignWorkOrderDto'];
export type UpdateWorkOrderStatusDto = components['schemas']['UpdateWorkOrderStatusDto'];

export type WorkOrderPriority = components['schemas']['WorkOrderResDto']['priority'];
export type WorkOrderStatus = components['schemas']['WorkOrderResDto']['status'];

export type WorkOrderEventResDto = components['schemas']['WorkOrderEventResDto'];
export type SubmitProgressEventDto = components['schemas']['SubmitProgressEventDto'];
export type WorkOrderEventType = components['schemas']['WorkOrderEventResDto']['type'];

export type AttachmentResDto = components['schemas']['AttachmentResDto'];
export type StorageUsageResDto = components['schemas']['StorageUsageResDto'];
