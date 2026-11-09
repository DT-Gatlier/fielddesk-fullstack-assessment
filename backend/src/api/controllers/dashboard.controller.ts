import { Request, Response, NextFunction } from 'express';
import { workOrderService } from '../../services/work-order.service.js';

export class DashboardController {
  getMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metrics = await workOrderService.getDashboardMetrics(req.tenantContext);
      res.status(200).json(metrics);
    } catch (err) {
      next(err);
    }
  };
}

export const dashboardController = new DashboardController();

