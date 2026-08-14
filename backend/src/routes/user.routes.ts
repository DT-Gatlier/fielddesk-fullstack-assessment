import { Router } from 'express';
import { listUsers, updateUserRole } from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { orgScope } from '../middleware/orgScope';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate, orgScope);

// Only owners and dispatchers can list users
router.get('/', authorize(Role.OWNER, Role.DISPATCHER), listUsers);

// Only owners can change roles
router.patch('/:id/role', authorize(Role.OWNER), updateUserRole);

export default router;
