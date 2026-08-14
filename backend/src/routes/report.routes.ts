import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { orgScope } from '../middleware/orgScope';
import { Role } from '@prisma/client';
import { CsvExporter } from '../utils/csvExport';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate, orgScope, authorize(Role.OWNER, Role.DISPATCHER));

router.get('/work-orders/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    logger.info({ orgId, reqId: req.correlationId }, 'Started CSV export');
    
    // We can extract filters from req.query if needed, e.g., { status: req.query.status }
    const filters = {};
    if (req.query.status) {
      (filters as any).status = req.query.status;
    }

    await CsvExporter.streamWorkOrders(orgId, res, filters);
  } catch (error) {
    logger.error({ error, reqId: req.correlationId }, 'CSV export failed');
    next(error);
  }
});

export default router;
