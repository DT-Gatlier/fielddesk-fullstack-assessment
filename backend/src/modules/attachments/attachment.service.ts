import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../config/prisma";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class AttachmentService {
  async uploadAttachment(
    workOrderId: string,
    organisationId: string,
    userId: string,
    role: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
  ) {
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      const err: any = new Error("Invalid file type. Only PDF and images are allowed.");
      err.status = 400;
      throw err;
    }

    const signatures: Record<string, (b: Buffer) => boolean> = {
      "application/pdf": (b) => b.subarray(0, 5).toString() === "%PDF-",
      "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
    };
    if (!file.size || !signatures[file.mimetype](file.buffer)) {
      const err: any = new Error("File contents do not match an allowed PDF or image type.");
      err.status = 400;
      throw err;
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organisationId },
    });

    if (!workOrder) {
      const err: any = new Error("Work order not found");
      err.status = 404;
      throw err;
    }
    if (role === "TECHNICIAN" && workOrder.assignedTechnicianId !== userId) {
      const err: any = new Error("You are not assigned to this work order");
      err.status = 403;
      throw err;
    }

    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });

    if (!organisation) {
      const err: any = new Error("Organisation not found");
      err.status = 404;
      throw err;
    }

    const currentUsed = Number(organisation.storageUsedBytes);
    const limit = Number(organisation.storageLimitBytes);

    if (currentUsed + file.size > limit) {
      const err: any = new Error(
        `Storage quota exceeded. Limit: ${(limit / 1048576).toFixed(1)}MB, Current: ${(currentUsed / 1048576).toFixed(1)}MB`
      );
      err.status = 413;
      throw err;
    }

    const extByMime: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    const ext = extByMime[file.mimetype];
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const destinationPath = path.join(UPLOADS_DIR, storedFileName);

    await fs.promises.writeFile(destinationPath, file.buffer);

    try {
    return await prisma.$transaction(async (tx) => {
      const quota = await tx.organisation.updateMany({
        where: { id: organisationId, storageUsedBytes: { lte: organisation.storageLimitBytes - BigInt(file.size) } },
        data: { storageUsedBytes: { increment: file.size } },
      });
      if (quota.count !== 1) {
        const err: any = new Error("Organisation storage quota exceeded");
        err.status = 413;
        throw err;
      }
      const attachment = await tx.attachment.create({
        data: {
          fileName: path.basename(file.originalname),
          storedFileName,
          fileSize: file.size,
          mimeType: file.mimetype,
          workOrderId,
          organisationId,
          uploadedById: userId,
        },
      });

      await tx.auditLog.create({ data: { organisationId, actorId: userId, action: "attachment.added", targetType: "Attachment", targetId: attachment.id, after: { workOrderId, fileName: attachment.fileName, fileSize: attachment.fileSize, mimeType: attachment.mimeType } } });

      return attachment;
    });
    } catch (error) {
      await fs.promises.rm(destinationPath, { force: true });
      throw error;
    }
  }

  async listAttachments(workOrderId: string, organisationId: string, role: string, userId: string) {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organisationId },
    });

    if (!workOrder) {
      const err: any = new Error("Work order not found");
      err.status = 404;
      throw err;
    }
    if (role === "TECHNICIAN" && workOrder.assignedTechnicianId !== userId) {
      const err: any = new Error("You are not assigned to this work order");
      err.status = 403;
      throw err;
    }

    return prisma.attachment.findMany({
      where: { workOrderId, organisationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getAttachmentFile(
    workOrderId: string,
    attachmentId: string,
    organisationId: string,
    role: string,
    userId: string
  ) {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, workOrderId, organisationId },
    });

    if (!attachment) {
      const err: any = new Error("Attachment not found");
      err.status = 404;
      throw err;
    }
    if (role === "TECHNICIAN" && attachment.workOrderId !== workOrderId) {
      const err: any = new Error("Access denied");
      err.status = 403;
      throw err;
    }
    if (role === "TECHNICIAN") {
      const order = await prisma.workOrder.findFirst({ where: { id: workOrderId, organisationId, assignedTechnicianId: userId }, select: { id: true } });
      if (!order) {
        const err: any = new Error("You are not assigned to this work order");
        err.status = 403;
        throw err;
      }
    }

    const filePath = path.join(UPLOADS_DIR, attachment.storedFileName);

    if (!fs.existsSync(filePath)) {
      const err: any = new Error("File missing on server storage");
      err.status = 404;
      throw err;
    }

    return {
      filePath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    };
  }
}

