import type { Request, Response } from "express";
import crypto from "node:crypto";

import {
  createProgressEvent,
  WorkOrderNotFoundError,
} from "./progress-event.service";

import { createProgressEventSchema } from "./progress-event.schema";

export const createProgressEventController = async (
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

    const parsed = createProgressEventSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid progress event",
          details: parsed.error.flatten(),
        },
      });
    }

    const eventId =
      req.header("Idempotency-Key") ?? crypto.randomUUID();

    const event = await createProgressEvent(
      req.user.organisationId,
      req.params.workOrderId as string,
      req.user.id,
      eventId as string,
      parsed.data,
    );

    return res.status(201).json({
      event,
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