import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { attachmentController } from '../controllers/attachment.controller.js';

const router = Router();

// GET /api/v1/attachments/:id/download
router.get('/:id/download', authenticate, (req, res, next) =>
  attachmentController.downloadAttachment(req, res, next)
);

// DELETE /api/v1/attachments/:id
router.delete('/:id', authenticate, (req, res, next) =>
  attachmentController.deleteAttachment(req, res, next)
);

export default router;

