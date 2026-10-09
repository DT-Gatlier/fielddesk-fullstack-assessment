import type {
  AssignWorkOrderInput,
  CreateWorkOrderInput,
  PaginatedWorkOrders,
  PaginationParams,
  UpdateWorkOrderInput,
  UpdateWorkOrderStatusInput,
  WorkOrderFilterInput,
  WorkOrderSummary,
} from './work-order.interface';

export const WORK_ORDER_REPOSITORY = Symbol('WORK_ORDER_REPOSITORY');

export interface CreateWorkOrderEntityInput extends CreateWorkOrderInput {
  creatorId: string;
}

export interface WorkOrderRepositoryPort {
  findById(
    organisationId: string,
    workOrderId: string,
  ): Promise<WorkOrderSummary | null>;

  listByOrganisation(
    organisationId: string,
    filter: WorkOrderFilterInput,
    pagination: PaginationParams,
  ): Promise<PaginatedWorkOrders>;

  streamByOrganisation(
    organisationId: string,
    filter: WorkOrderFilterInput,
    onBatch: (batch: WorkOrderSummary[]) => Promise<void>,
    batchSize?: number,
    shouldAbort?: () => boolean,
  ): Promise<void>;

  countByOrganisation(organisationId: string): Promise<number>;

  create(
    organisationId: string,
    input: CreateWorkOrderEntityInput,
    txClient?: unknown,
  ): Promise<WorkOrderSummary>;

  update(
    organisationId: string,
    workOrderId: string,
    input: UpdateWorkOrderInput,
  ): Promise<WorkOrderSummary | null>;

  updateAssignment(
    organisationId: string,
    workOrderId: string,
    input: AssignWorkOrderInput,
    txClient?: unknown,
  ): Promise<WorkOrderSummary | null>;

  updateStatus(
    organisationId: string,
    workOrderId: string,
    input: UpdateWorkOrderStatusInput,
  ): Promise<WorkOrderSummary | null>;
}
