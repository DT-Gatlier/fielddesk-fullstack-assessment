import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import { config } from '../../shared/config';
import { pool } from '../../shared/db';
import { pendingMigrations } from './db/migrator';
import type { AppDeps } from './deps';
import { authenticate, originCheck } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestContext } from './middleware/request-context';
import { attachmentsRouter } from './modules/attachments/routes';
import { authRouter } from './modules/auth/routes';
import { eventsRouter } from './modules/events/routes';
import { organisationRouter } from './modules/organisation/routes';
import { realtimeRouter } from './modules/realtime/routes';
import { usersRouter } from './modules/users/routes';
import { workOrdersRouter } from './modules/work-orders/routes';
import './types';

/** Flipped by the shutdown handler so /readyz fails and the load balancer drains this instance. */
export const lifecycle = { shuttingDown: false };

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);

  app.use(requestContext);
  app.use(helmet());

  // Liveness: the process is up and serving HTTP.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: dependencies reachable, schema migrated, not shutting down.
  app.get('/readyz', async (_req, res) => {
    const checks: Record<string, string> = {};
    const timeout = <T>(p: Promise<T>) =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
    await Promise.all([
      timeout(pool.query('SELECT 1')).then(() => (checks.database = 'ok'), () => (checks.database = 'unavailable')),
      timeout(pendingMigrations(pool)).then(
        (p) => (checks.migrations = p.length ? `pending: ${p.join(', ')}` : 'ok'),
        () => (checks.migrations = 'unknown'),
      ),
      timeout(deps.redis.ping()).then(() => (checks.redis = 'ok'), () => (checks.redis = 'unavailable')),
    ]);
    checks.realtime = deps.realtime.isHealthy ? 'ok' : 'degraded';
    if (lifecycle.shuttingDown) checks.lifecycle = 'shutting_down';
    // Real-time is not required for readiness: the API still serves correct data without it.
    const ready = !lifecycle.shuttingDown && checks.database === 'ok' && checks.migrations === 'ok' && checks.redis === 'ok';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();
  api.use(originCheck);
  api.use('/auth', authRouter(deps));

  // Every route below requires a valid session.
  api.use(authenticate);
  api.use('/organisation', organisationRouter());
  api.use('/users', usersRouter());
  const attachments = attachmentsRouter(deps);
  api.use('/work-orders', attachments.workOrderScoped);
  api.use('/work-orders', workOrdersRouter(deps));
  api.use('/attachments', attachments.byId);
  api.use('/progress-events', eventsRouter(deps));
  api.use('/realtime', realtimeRouter(deps));

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
