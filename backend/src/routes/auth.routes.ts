import { Router } from 'express';
import { login, me, refresh } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema } from '../schemas/auth.schema';
import { authenticate } from '../middleware/authenticate';
import rateLimit from 'express-rate-limit';

const router = Router();

// Stricter rate limiting for login (5 requests per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: { error: { message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);

export default router;
