import { Router } from 'express';
import { submitEvent } from '../controllers/progressEvent.controller';
import { validate } from '../middleware/validate';
import { submitEventSchema } from '../schemas/progressEvent.schema';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { orgScope } from '../middleware/orgScope';
import { Role } from '@prisma/client';
import rateLimit from 'express-rate-limit';

const router = Router();

// Apply auth and tenant scope
router.use(authenticate, orgScope);

// Rate limiting specifically for event submissions to prevent spam (30 requests per minute)
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: { message: 'Too many events submitted, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/',
  eventLimiter,
  authorize(Role.TECHNICIAN), // Only technicians submit progress events
  validate(submitEventSchema),
  submitEvent
);

export default router;
