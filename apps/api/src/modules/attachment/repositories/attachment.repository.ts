import type { Prisma } from '@fielddesk/database';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type {
  AttachmentRepositoryPort,
  AttachmentStorageDetails,
  AttachmentSummary,
  CreateAttachmentRecordInput,
  StorageQuotaUsage,
} from '../interfaces/attachment.interface';

const attachmentSummarySelect = {
  id: true,
  organisationId: true,
  workOrderId: true,
  uploaderId: true,
  uploader: {
    select: {
      name: true,
    },
  },
  originalFileName: true,
  mimeType: true,
  byteSize: true,
  contentHash: true,
  createdAt: true,
} as const;

type PrismaAttachmentSummaryResult = Prisma.AttachmentGetPayload<{
  select: typeof attachmentSummarySelect;
}>;

function mapAttachmentSummary(
  record: PrismaAttachmentSummaryResult,
): AttachmentSummary {
  return {
    id: record.id,
    organisationId: record.organisationId,
    workOrderId: record.workOrderId,
    uploaderId: record.uploaderId,
    uploaderName: record.uploader.name,
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    contentHash: record.contentHash,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class AttachmentRepository implements AttachmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAttachmentRecordInput): Promise<AttachmentSummary> {
    const record = await this.prisma.client.attachment.create({
      data: {
        organisationId: input.organisationId,
        workOrderId: input.workOrderId,
        uploaderId: input.uploaderId,
        storageKey: input.storageKey,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        contentHash: input.contentHash,
      },
      select: attachmentSummarySelect,
    });

    return mapAttachmentSummary(record);
  }

  async findById(
    organisationId: string,
    workOrderId: string,
    attachmentId: string,
  ): Promise<AttachmentStorageDetails | null> {
    const record = await this.prisma.client.attachment.findFirst({
      where: {
        id: attachmentId,
        organisationId,
        workOrderId,
      },
      select: {
        ...attachmentSummarySelect,
        storageKey: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      ...mapAttachmentSummary(record),
      storageKey: record.storageKey,
    };
  }

  async findByWorkOrderAndHash(
    organisationId: string,
    workOrderId: string,
    contentHash: string,
  ): Promise<AttachmentSummary | null> {
    const record = await this.prisma.client.attachment.findUnique({
      where: {
        organisationId_workOrderId_contentHash: {
          organisationId,
          workOrderId,
          contentHash,
        },
      },
      select: attachmentSummarySelect,
    });

    if (!record) {
      return null;
    }

    return mapAttachmentSummary(record);
  }

  async findFirstByHash(
    organisationId: string,
    contentHash: string,
  ): Promise<AttachmentStorageDetails | null> {
    const record = await this.prisma.client.attachment.findFirst({
      where: {
        organisationId,
        contentHash,
      },
      select: {
        ...attachmentSummarySelect,
        storageKey: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      ...mapAttachmentSummary(record),
      storageKey: record.storageKey,
    };
  }

  async countByStorageKey(storageKey: string): Promise<number> {
    return this.prisma.client.attachment.count({
      where: { storageKey },
    });
  }

  async listByWorkOrder(
    organisationId: string,
    workOrderId: string,
  ): Promise<AttachmentSummary[]> {
    const records = await this.prisma.client.attachment.findMany({
      where: {
        organisationId,
        workOrderId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: attachmentSummarySelect,
    });

    return records.map(mapAttachmentSummary);
  }

  async getOrganisationStorageUsage(
    organisationId: string,
  ): Promise<StorageQuotaUsage | null> {
    const org = await this.prisma.client.organisation.findUnique({
      where: { id: organisationId },
      select: { storageQuotaBytes: true },
    });

    if (!org) {
      return null;
    }

    const aggregation = await this.prisma.client.attachment.aggregate({
      where: { organisationId },
      _sum: { byteSize: true },
    });

    const usedBytes = BigInt(aggregation._sum.byteSize ?? 0);

    return {
      usedBytes,
      quotaBytes: org.storageQuotaBytes,
    };
  }

  async delete(
    organisationId: string,
    workOrderId: string,
    attachmentId: string,
  ): Promise<AttachmentStorageDetails | null> {
    const record = await this.prisma.client.attachment.findFirst({
      where: {
        id: attachmentId,
        organisationId,
        workOrderId,
      },
      select: {
        ...attachmentSummarySelect,
        storageKey: true,
      },
    });

    if (!record) {
      return null;
    }

    try {
      await this.prisma.client.attachment.delete({
        where: { id: attachmentId },
      });
    } catch {
      // Return null if record was concurrently deleted
      return null;
    }

    return {
      ...mapAttachmentSummary(record),
      storageKey: record.storageKey,
    };
  }
}
