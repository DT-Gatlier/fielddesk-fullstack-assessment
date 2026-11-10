import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { attachmentController } from '../controllers/attachment.controller.js';

const router = Router();

// GET /api/v1/organisations/quota
router.get('/quota', authenticate, (req, res, next) =>
  attachmentController.getQuota(req, res, next)
);

export default router;

