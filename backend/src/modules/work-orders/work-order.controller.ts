import { Request, Response, NextFunction } from "express";
import { Readable } from "stream";
import { WorkOrderService } from "./work-order.service";
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderQuerySchema,
  exportWorkOrderQuerySchema,
} from "./work-order.validation";

const workOrderService = new WorkOrderService();

export class WorkOrderController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const query = workOrderQuerySchema.parse(req.query);
      const result = await workOrderService.listWorkOrders(
        auth.organisationId,
        auth.role,
        auth.userId,
        query
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const workOrder = await workOrderService.getWorkOrderById(
        String(req.params.id),
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.status(200).json({
        success: true,
        workOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const input = createWorkOrderSchema.parse(req.body);
      const workOrder = await workOrderService.createWorkOrder(
        input,
        auth.organisationId,
        auth.userId
      );

      res.status(201).json({
        success: true,
        message: "Work order created successfully",
        workOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const input = updateWorkOrderSchema.parse(req.body);
      const workOrder = await workOrderService.updateWorkOrder(
        String(req.params.id),
        input,
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.status(200).json({
        success: true,
        message: "Work order updated successfully",
        workOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const metrics = await workOrderService.getMetrics(
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.status(200).json({
        success: true,
        metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTechnicians(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const technicians = await workOrderService.getTechnicians(
        auth.organisationId
      );

      res.status(200).json({
        success: true,
        technicians,
      });
    } catch (error) {
      next(error);
    }
  }

  async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const query = exportWorkOrderQuerySchema.parse(req.query);
      const csv = await workOrderService.exportWorkOrdersCsv(
        auth.organisationId,
        auth.role,
        auth.userId,
        {
          ...query,
        }
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="work-orders-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.status(200);
      Readable.from(csv).pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

