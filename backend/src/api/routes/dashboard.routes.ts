import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { dashboardController } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/metrics', authenticate, dashboardController.getMetrics);

export default router;

