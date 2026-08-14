import type { Request, Response } from "express";

import {
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  updateWorkOrder,
  WorkOrderNotFoundError,
  TechnicianNotFoundError,
} from "./work-order.service";

import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderListSchema,
} from "./work-order.schema";

export const createWorkOrderController = async (
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

    const parsed = createWorkOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid work order data",
          details: parsed.error.flatten(),
        },
      });
    }

    const workOrder = await createWorkOrder(
      req.user.organisationId,
      req.user.id,
      parsed.data,
    );

    return res.status(201).json({
      workOrder,
    });
  } catch (error) {
    if (error instanceof TechnicianNotFoundError) {
      return res.status(400).json({
        error: {
          code: "INVALID_TECHNICIAN",
          message: error.message,
        },
      });
    }

    throw error;
  }
};

export const listWorkOrdersController = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
    });
  }

  const parsed = workOrderListSchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: parsed.error.flatten(),
      },
    });
  }

  const result = await listWorkOrders(
    req.user.organisationId,
    parsed.data,
  );

  return res.status(200).json(result);
};

export const getWorkOrderController = async (
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

    const workOrder = await getWorkOrder(
      req.user.organisationId,
      req.params.id as string,
    );

    return res.status(200).json({
      workOrder,
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

export const updateWorkOrderController = async (
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

    const parsed = updateWorkOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid work order data",
          details: parsed.error.flatten(),
        },
      });
    }

    const workOrder = await updateWorkOrder(
      req.user.organisationId,
      req.params.id as string,
      parsed.data,
    );

    return res.status(200).json({
      workOrder,
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

    if (error instanceof TechnicianNotFoundError) {
      return res.status(400).json({
        error: {
          code: "INVALID_TECHNICIAN",
          message: error.message,
        },
      });
    }

    throw error;
  }
};