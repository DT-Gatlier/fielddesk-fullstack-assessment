import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/authorize.js';

const router = Router();

// Dispatcher or Owner can list technicians
router.get('/technicians', authenticate, requireRole('owner', 'dispatcher'), userController.listTechnicians);

// Dispatcher or Owner can look up user details within their organisation
router.get('/:id', authenticate, requireRole('owner', 'dispatcher'), userController.getUserById);

export default router;
