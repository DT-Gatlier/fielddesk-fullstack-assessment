import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { workOrderController } from '../controllers/work-order.controller.js';
import { eventController } from '../controllers/event.controller.js';
import { attachmentController } from '../controllers/attachment.controller.js';
import { uploadSingleFile, validateMagicBytes } from '../middlewares/file-validator.js';
import {
  listWorkOrdersQuerySchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  assignTechnicianSchema,
} from '../dtos/work-order.dto.js';
import { progressEventSchema } from '../dtos/event.dto.js';

const router = Router();

router.get(
  '/',
  authenticate,
  validate(listWorkOrdersQuerySchema, 'query'),
  workOrderController.list
);

router.post(
  '/',
  authenticate,
  requireRole('owner', 'dispatcher'),
  validate(createWorkOrderSchema, 'body'),
  workOrderController.create
);

router.get(
  '/:id',
  authenticate,
  workOrderController.getById
);

router.patch(
  '/:id',
  authenticate,
  requireRole('owner', 'dispatcher'),
  validate(updateWorkOrderSchema, 'body'),
  workOrderController.update
);

router.post(
  '/:id/assign',
  authenticate,
  requireRole('owner', 'dispatcher'),
  validate(assignTechnicianSchema, 'body'),
  workOrderController.assignTechnician
);

router.post(
  '/:id/events',
  authenticate,
  validate(progressEventSchema, 'body'),
  eventController.submitProgressEvent
);

router.post(
  '/:id/attachments',
  authenticate,
  uploadSingleFile,
  validateMagicBytes,
  (req, res, next) => attachmentController.uploadAttachment(req, res, next)
);

router.get(
  '/:id/attachments',
  authenticate,
  (req, res, next) => attachmentController.listWorkOrderAttachments(req, res, next)
);

export default router;

