import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { correlationIdMiddleware } from './api/middlewares/correlation-id.js';
import { requestLoggerMiddleware } from './api/middlewares/request-logger.js';
import { errorHandler } from './api/middlewares/error-handler.js';
import healthRoutes from './api/routes/health.routes.js';
import authRoutes from './api/routes/auth.routes.js';
import userRoutes from './api/routes/user.routes.js';
import workOrderRoutes from './api/routes/work-order.routes.js';
import dashboardRoutes from './api/routes/dashboard.routes.js';
import attachmentRoutes from './api/routes/attachment.routes.js';
import organisationRoutes from './api/routes/organisation.routes.js';
import realtimeRoutes from './api/routes/realtime.routes.js';
import reportRoutes from './api/routes/report.routes.js';
import { NotFoundError } from './domain/errors/index.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', true);

  // Basic security and parsing middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Health & readiness probes
  app.use('/', healthRoutes);

  // Mount API v1 routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1', reportRoutes);
  app.use('/api/v1/work-orders', workOrderRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/attachments', attachmentRoutes);
  app.use('/api/v1/organisations', organisationRoutes);
  app.use('/api/v1/realtime', realtimeRoutes);

  // 404 handler for unknown routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    next(new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' not found.`));
  });

  // Global RFC 7807 error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
