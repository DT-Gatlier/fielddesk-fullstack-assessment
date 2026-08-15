import { Router } from 'express';
import { 
  listWorkOrders, 
  getWorkOrder, 
  createWorkOrder, 
  updateWorkOrder, 
  getDashboardSummary,
  getAuditHistory,
  assignTechnician
} from '../controllers/workOrder.controller';
import { validate } from '../middleware/validate';
import { 
  createWorkOrderSchema, 
  updateWorkOrderSchema, 
  listWorkOrdersSchema,
  assignTechnicianSchema
} from '../schemas/workOrder.schema';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { orgScope } from '../middleware/orgScope';
import { Role } from '@prisma/client';

const router = Router();

// Apply auth and tenant scope to all routes
router.use(authenticate, orgScope);

// Dashboard counts
router.get('/dashboard-summary', getDashboardSummary);

// CRUD
router.get('/', validate(listWorkOrdersSchema), listWorkOrders);
router.get('/:id', getWorkOrder);

// Only Owner and Dispatcher can create/update or view history
router.post('/', authorize(Role.OWNER, Role.DISPATCHER), validate(createWorkOrderSchema), createWorkOrder);
router.patch('/:id', authorize(Role.OWNER, Role.DISPATCHER), validate(updateWorkOrderSchema), updateWorkOrder);
router.get('/:id/history', authorize(Role.OWNER, Role.DISPATCHER), getAuditHistory);
router.post('/:id/assign', authorize(Role.OWNER, Role.DISPATCHER), validate(assignTechnicianSchema), assignTechnician);

export default router;
