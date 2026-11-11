import { Request, Response, NextFunction } from 'express';
import { reportService, ExportWorkOrdersFilters } from '../../services/report.service.js';

export const reportController = {
  exportWorkOrdersCsv: async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const filters: ExportWorkOrdersFilters = {
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        technicianId: req.query.technicianId as string | undefined,
        search: req.query.search as string | undefined,
      };

      await reportService.streamWorkOrdersCsv(req.tenantContext, filters, res);
    } catch (err) {
      next(err);
    }
  },
};

