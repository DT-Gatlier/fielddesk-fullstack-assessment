import { prisma } from "../../lib/prisma";

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super("Work order not found");
    this.name = "WorkOrderNotFoundError";
  }
}

export class StorageLimitExceededError extends Error {
  constructor() {
    super("Organisation storage limit exceeded");
    this.name = "StorageLimitExceededError";
  }
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Attachment not found");
    this.name = "AttachmentNotFoundError";
  }
}

export const createAttachment = async (
  organisationId: string,
  uploadedById: string,
  workOrderId: string,
  file: Express.Multer.File,
) => {
  // --------------------------------------------------
  // 1. Verify work order belongs to this organisation
  // --------------------------------------------------

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundError();
  }

  // --------------------------------------------------
  // 2. Get organisation
  // --------------------------------------------------

  const organisation = await prisma.organisation.findUnique({
    where: {
      id: organisationId,
    },
  });

  if (!organisation) {
    throw new WorkOrderNotFoundError();
  }

  // --------------------------------------------------
  // 3. Check storage limit
  // --------------------------------------------------

  const fileSize = BigInt(file.size);

  if (
    organisation.storageUsedBytes + fileSize >
    organisation.storageLimitBytes
  ) {
    throw new StorageLimitExceededError();
  }

  // --------------------------------------------------
  // 4. Create attachment metadata
  // --------------------------------------------------

  const attachment = await prisma.$transaction(async (tx) => {
    const createdAttachment = await tx.attachment.create({
      data: {
        organisationId,
        workOrderId,
        uploadedById,

        originalFilename: file.originalname,
        storageKey: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    // ------------------------------------------------
    // 5. Update organisation storage usage
    // ------------------------------------------------

    await tx.organisation.update({
      where: {
        id: organisationId,
      },
      data: {
        storageUsedBytes: {
          increment: file.size,
        },
      },
    });

    return createdAttachment;
  });

  return attachment;
};

export const listAttachments = async (
  organisationId: string,
  workOrderId: string,
) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundError();
  }

  return prisma.attachment.findMany({
    where: {
      organisationId,
      workOrderId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

export const getAttachment = async (
  organisationId: string,
  attachmentId: string,
) => {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      organisationId,
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  return attachment;
};

export const deleteAttachment = async (
  organisationId: string,
  attachmentId: string,
) => {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      organisationId,
    },
  });

  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({
      where: {
        id: attachmentId,
      },
    });

    await tx.organisation.update({
      where: {
        id: organisationId,
      },
      data: {
        storageUsedBytes: {
          decrement: attachment.sizeBytes,
        },
      },
    });
  });

  return attachment;
};