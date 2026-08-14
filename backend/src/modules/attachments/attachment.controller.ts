import type { Request, Response } from "express";

import {
  createAttachment,
  deleteAttachment,
  getAttachment,
  listAttachments,
  AttachmentNotFoundError,
  StorageLimitExceededError,
  WorkOrderNotFoundError,
} from "./attachment.service";

export const uploadAttachmentController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message: "A file is required",
        },
      });
    }

    const attachment = await createAttachment(
      req.user.organisationId,
      req.user.id,
      req.params.workOrderId as string,
      req.file,
    );

    return res.status(201).json({
        attachment: {
            ...attachment,
            sizeBytes: attachment.sizeBytes.toString(),
        },
    });
  } catch (error) {
    if (error instanceof WorkOrderNotFoundError) {
      return res.status(404).json({
        error: {
          code: "WORK_ORDER_NOT_FOUND",
          message: error.message,
        },
      });
    }

    if (error instanceof StorageLimitExceededError) {
      return res.status(413).json({
        error: {
          code: "STORAGE_LIMIT_EXCEEDED",
          message: error.message,
        },
      });
    }

    throw error;
  }
};

export const listAttachmentsController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const result = await listAttachments(
      req.user.organisationId,
      req.params.workOrderId as string,
    );

    return res.status(200).json({
        attachments: result.map((attachment) => ({
            ...attachment,
            sizeBytes: attachment.sizeBytes.toString(),
        })),
    });
  } catch (error) {
    if (error instanceof WorkOrderNotFoundError) {
      return res.status(404).json({
        error: {
          code: "WORK_ORDER_NOT_FOUND",
          message: error.message,
        },
      });
    }

    throw error;
  }
};

export const getAttachmentController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const attachment = await getAttachment(
      req.user.organisationId,
      req.params.id as string,
    );

    return res.status(200).json({
      attachment,
    });
  } catch (error) {
    if (error instanceof AttachmentNotFoundError) {
      return res.status(404).json({
        error: {
          code: "ATTACHMENT_NOT_FOUND",
          message: error.message,
        },
      });
    }

    throw error;
  }
};

export const deleteAttachmentController = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const attachment = await deleteAttachment(
      req.user.organisationId,
      req.params.id as string,
    );

    return res.status(200).json({
      message: "Attachment deleted successfully",
      attachment,
    });
  } catch (error) {
    if (error instanceof AttachmentNotFoundError) {
      return res.status(404).json({
        error: {
          code: "ATTACHMENT_NOT_FOUND",
          message: error.message,
        },
      });
    }

    throw error;
  }
};