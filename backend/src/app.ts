import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { attachmentRoutes } from './attachments/routes.js';
import { LocalDiskStorage, type StorageDriver } from './attachments/storage.js';
import { authRoutes } from './auth/routes.js';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { healthRoutes } from './health/routes.js';
import { AppError, forbidden, registerErrorHandling } from './http/errors.js';
import { createNotificationQueue, type NotificationQueue } from './notifications/queue.js';
import { organisationRoutes } from './organisation/routes.js';
import { progressEventRoutes } from './progress-events/routes.js';
import { RealtimeHub } from './realtime/hub.js';
import { realtimeRoutes } from './realtime/routes.js';
import { userRoutes } from './users/routes.js';
import { workOrderRoutes } from './work-orders/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    pg: Pool;
    redis: Redis;
    storage: StorageDriver;
    notificationQueue: NotificationQueue;
    realtime: RealtimeHub;
    shuttingDown: boolean;
  }
}

export interface AppDependencies {
  config: Config;
  pool: Pool;
  redis: Redis;
  /** Defaults to local disk under UPLOAD_DIR. */
  storage?: StorageDriver;
  /** Defaults to the BullMQ notification queue. Tests substitute a recorder. */
  notificationQueue?: NotificationQueue;
  /** Separates rate-limit counters, e.g. per test file. */
  rateLimitNamespace?: string;
  realtimeHeartbeatMs?: number;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, pool, redis } = deps;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password'],
        censor: '[redacted]',
      },
    },
    // Correlation id: accept a well-formed X-Request-Id from a proxy or client, otherwise generate one.
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    },
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    trustProxy: config.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
  });

  const ownedQueue = deps.notificationQueue
    ? undefined
    : createNotificationQueue(redis.duplicate({ maxRetriesPerRequest: null }), {
        maxAttempts: config.NOTIFICATION_MAX_ATTEMPTS,
        backoffMs: config.NOTIFICATION_BACKOFF_MS,
      });
  const hub = new RealtimeHub(redis.duplicate(), app.log);

  app.decorate('config', config);
  app.decorate('pg', pool);
  app.decorate('redis', redis);
  app.decorate('storage', deps.storage ?? new LocalDiskStorage(config.UPLOAD_DIR));
  app.decorate('notificationQueue', deps.notificationQueue ?? ownedQueue!);
  app.decorate('realtime', hub);
  app.decorate('shuttingDown', false);
  app.decorateRequest('auth', null);

  await hub.start();
  app.addHook('onClose', async () => {
    await hub.close();
    await ownedQueue?.close();
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // CSRF defence in addition to the SameSite=Strict session cookie: browsers always send Origin on
  // cross-site state-changing requests, so reject any that come from somewhere other than the web app.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== config.WEB_ORIGIN) throw forbidden('Cross-origin request rejected.');
  });

  registerErrorHandling(app);

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.MAX_ATTACHMENT_BYTES, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 1024 } });
  await app.register(rateLimit, {
    global: false,
    redis,
    nameSpace: deps.rateLimitNamespace ?? 'fielddesk-rl:',
    // Keep serving if Redis is briefly unavailable; readiness reports the outage.
    skipOnError: true,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, 'RATE_LIMITED', `Too many requests. Retry after ${context.after}.`),
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(organisationRoutes);
  await app.register(workOrderRoutes);
  await app.register(progressEventRoutes);
  await app.register(attachmentRoutes);
  await app.register(realtimeRoutes, { heartbeatMs: deps.realtimeHeartbeatMs ?? 30_000 });

  return app;
}
