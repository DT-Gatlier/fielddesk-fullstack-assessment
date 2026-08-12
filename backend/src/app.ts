import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { Config } from './config.js';
import type { Database } from './database/pool.js';
import { errorHandler, notFoundHandler, requestContext } from './common/http.js';
import { login, logout, me, refresh } from './modules/auth/auth.controller.js';
import { authenticate, requireRoles } from './modules/auth/auth.middleware.js';
import { createDynamicRouter } from './modules/dynamic/dynamic.router.js';
import { dynamicRoutes } from './modules/dynamic/routes.config.js';
import { createWorkOrder, deleteWorkOrder, getWorkOrder, listWorkOrders, technicianAvailability, updateWorkOrder } from './modules/work-orders/work-order.controller.js';
import { submitProgressEvent } from './modules/progress/progress.controller.js';
import { addAttachment, deleteAttachment, downloadAttachment, listAttachments, uploadMiddleware } from './modules/uploads/upload.controller.js';
import { noOpRuntime, type RuntimeServices } from './infrastructure/runtime.js';
import { getOrganisation, updateOrganisation } from './modules/organisation/organisation.controller.js';
import { createUser, listUsers, updateUser } from './modules/users/user.controller.js';
import { getDashboard } from './modules/dashboard/dashboard.controller.js';
import { listAuditEntries } from './modules/audit/audit.controller.js';
import { listNotifications, retryNotification } from './modules/notifications/notification.controller.js';
import { eventStream } from './modules/realtime/realtime.controller.js';
import { exportWorkOrders } from './modules/reports/report.controller.js';

export function createApp(database: Database, config: Config, runtime: RuntimeServices = noOpRuntime) {
  const app = express();
  const logger = pino({ level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.body.password'] });
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(pinoHttp({ logger, genReqId: (request: IncomingMessage & { requestId?: string }) => request.requestId ?? String(request.headers['x-request-id'] ?? randomUUID()) }));
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', async (_request, response) => {
    try { await database.query('SELECT 1'); response.status(runtime.ready ? 200 : 503).json({ status: runtime.ready ? 'ready' : 'degraded', components: { postgres: 'ready', redis: runtime.ready ? 'ready' : 'not_ready' } }); }
    catch { response.status(503).json({ status: 'not_ready', components: { postgres: 'not_ready', redis: runtime.ready ? 'ready' : 'not_ready' } }); }
  });

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const eventLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
  app.post('/api/v1/auth/login', authLimiter, login(database, config));
  app.post('/api/v1/auth/refresh', authLimiter, refresh(database, config));
  app.post('/api/v1/auth/logout', authenticate(config, database), logout(database, config));

  const auth = authenticate(config, database);
  app.get('/api/v1/auth/me', auth, me(database));
  app.get('/api/v1/organisation', auth, getOrganisation(database));
  app.put('/api/v1/organisation', auth, requireRoles('owner'), updateOrganisation(database, runtime));
  app.get('/api/v1/users', auth, requireRoles('owner', 'dispatcher'), listUsers(database));
  app.post('/api/v1/users', auth, requireRoles('owner'), createUser(database, runtime));
  app.put('/api/v1/users/:id', auth, requireRoles('owner'), updateUser(database, runtime));
  app.get('/api/v1/dashboard', auth, getDashboard(database, runtime));
  app.get('/api/v1/audit-entries', auth, requireRoles('owner', 'dispatcher'), listAuditEntries(database));
  app.get('/api/v1/notifications', auth, requireRoles('owner', 'dispatcher'), listNotifications(database));
  app.post('/api/v1/notifications/:id/retry', auth, requireRoles('owner', 'dispatcher'), retryNotification(database));
  app.get('/api/v1/events/stream', auth, eventStream(runtime));
  app.get('/api/v1/reports/work-orders.csv', auth, exportWorkOrders(database));
  app.get('/api/v1/technicians/availability', auth, technicianAvailability(database));
  app.get('/api/v1/work-orders', auth, listWorkOrders(database));
  app.get('/api/v1/work-orders/:id', auth, getWorkOrder(database));
  app.post('/api/v1/work-orders', auth, requireRoles('owner', 'dispatcher'), createWorkOrder(database, runtime));
  app.put('/api/v1/work-orders/:id', auth, requireRoles('owner', 'dispatcher'), updateWorkOrder(database, runtime));
  app.delete('/api/v1/work-orders/:id', auth, requireRoles('owner', 'dispatcher'), deleteWorkOrder(database, runtime));
  app.post('/api/v1/progress-events', eventLimiter, auth, requireRoles('technician'), submitProgressEvent(database, runtime));
  app.get('/api/v1/work-orders/:id/attachments', auth, listAttachments(database));
  app.post('/api/v1/work-orders/:id/attachments', auth, uploadMiddleware(config), addAttachment(database, config, runtime));
  app.get('/api/v1/work-orders/:id/attachments/:attachmentId', auth, downloadAttachment(database, config));
  app.delete('/api/v1/work-orders/:id/attachments/:attachmentId', auth, requireRoles('owner', 'dispatcher'), deleteAttachment(database, config, runtime));
  app.use('/api/v1', createDynamicRouter(database, config, dynamicRoutes));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
