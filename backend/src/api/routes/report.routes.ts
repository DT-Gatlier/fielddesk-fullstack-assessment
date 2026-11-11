import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/authorize.js';
import { reportController } from '../controllers/report.controller.js';

const router = Router();

router.get(
  '/work-orders/export/csv',
  authenticate,
  requireRole('owner', 'dispatcher'),
  reportController.exportWorkOrdersCsv
);

export default router;

