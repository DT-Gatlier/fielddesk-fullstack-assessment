import type { Request, Response } from "express";

import {
  listWorkOrderAuditLogs,
  WorkOrderNotFoundForAuditError,
} from "./audit-log.service";

import { auditLogListSchema } from "./audit-log.schema";

export const listWorkOrderAuditLogsController = async (
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

    const parsed = auditLogListSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid pagination parameters",
          details: parsed.error.flatten(),
        },
      });
    }

    const result = await listWorkOrderAuditLogs(
      req.user.organisationId,
      req.params.workOrderId as string,
      parsed.data,
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof WorkOrderNotFoundForAuditError) {
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