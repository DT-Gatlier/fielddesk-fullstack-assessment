import { Router } from 'express';
import { listUsers, updateUserRole, createUser, toggleUserStatus } from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { createUserSchema } from '../schemas/user.schema';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { orgScope } from '../middleware/orgScope';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate, orgScope);

// Only owners and dispatchers can list users
router.get('/', authorize(Role.OWNER, Role.DISPATCHER), listUsers);

// Only owners can create users
router.post('/', authorize(Role.OWNER), validate(createUserSchema), createUser);

// Only owners can change roles
router.patch('/:id/role', authorize(Role.OWNER), updateUserRole);

// Only owners can toggle user active status
router.patch('/:id/status', authorize(Role.OWNER), toggleUserStatus);

export default router;
