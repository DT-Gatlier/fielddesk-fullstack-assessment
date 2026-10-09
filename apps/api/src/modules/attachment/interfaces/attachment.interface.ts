export interface AttachmentSummary {
  id: string;
  organisationId: string;
  workOrderId: string;
  uploaderId: string;
  uploaderName: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  createdAt: Date;
}

export interface AttachmentStorageDetails extends AttachmentSummary {
  storageKey: string;
}

export interface CreateAttachmentRecordInput {
  organisationId: string;
  workOrderId: string;
  uploaderId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
}

export interface StorageQuotaUsage {
  usedBytes: bigint;
  quotaBytes: bigint;
}

export interface AttachmentRepositoryPort {
  create(input: CreateAttachmentRecordInput): Promise<AttachmentSummary>;
  findById(
    organisationId: string,
    workOrderId: string,
    attachmentId: string,
  ): Promise<AttachmentStorageDetails | null>;
  findByWorkOrderAndHash(
    organisationId: string,
    workOrderId: string,
    contentHash: string,
  ): Promise<AttachmentSummary | null>;
  findFirstByHash(
    organisationId: string,
    contentHash: string,
  ): Promise<AttachmentStorageDetails | null>;
  countByStorageKey(storageKey: string): Promise<number>;
  listByWorkOrder(
    organisationId: string,
    workOrderId: string,
  ): Promise<AttachmentSummary[]>;
  getOrganisationStorageUsage(organisationId: string): Promise<StorageQuotaUsage | null>;
  delete(
    organisationId: string,
    workOrderId: string,
    attachmentId: string,
  ): Promise<AttachmentStorageDetails | null>;
}

export const ATTACHMENT_REPOSITORY = Symbol('ATTACHMENT_REPOSITORY');
