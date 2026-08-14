import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { correlationId } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import workOrderRoutes from './routes/workOrder.routes';
import progressEventRoutes from './routes/progressEvent.routes';
import attachmentRoutes from './routes/attachment.routes';
import reportRoutes from './routes/report.routes';
import sseRoutes from './routes/sse.routes';
import userRoutes from './routes/user.routes';
import { prisma } from './utils/db';

// Fix BigInt serialization globally for JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());
app.use(correlationId);

// Setup pino http logger
app.use(pinoHttp({
  logger,
  customProps: (req) => {
    return { reqId: req.correlationId };
  },
  quietReqLogger: true,
}));


const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per window
  message: { error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global rate limiter to API routes
app.use('/api', globalLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/work-orders/:workOrderId/attachments', attachmentRoutes);
app.use('/api/progress-events', progressEventRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/users', userRoutes);

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness endpoint
app.get('/api/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not_ready' });
  }
});

// Error handling must be last
app.use(errorHandler);

export default app;
