import { Request, Response, NextFunction } from 'express';
import { workOrderService } from '../../services/work-order.service.js';
import {
  ListWorkOrdersQueryDTO,
  CreateWorkOrderDTO,
  UpdateWorkOrderDTO,
  assignTechnicianSchema,
} from '../dtos/work-order.dto.js';

export class WorkOrderController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = req.query as unknown as ListWorkOrdersQueryDTO;
      const result = await workOrderService.listWorkOrders(req.tenantContext, filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await workOrderService.getWorkOrderById(id, req.tenantContext);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateWorkOrderDTO;
      const result = await workOrderService.createWorkOrder(dto, req.tenantContext);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateWorkOrderDTO;
      const result = await workOrderService.updateWorkOrder(id, dto, req.tenantContext);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  assignTechnician = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const parsedBody = assignTechnicianSchema.parse(req.body);
      const result = await workOrderService.assignTechnician(id, parsedBody, req.tenantContext);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await workOrderService.getActivity(id, req.tenantContext);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const workOrderController = new WorkOrderController();

