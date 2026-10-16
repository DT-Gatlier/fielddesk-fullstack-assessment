export {};
process.env.SERVICE_NAME ??= 'fielddesk-worker';

const { config } = await import('../../shared/config');
const { closePool } = await import('../../shared/db');
const { logger } = await import('../../shared/logger');
const { createRedis } = await import('../../shared/redis');
const { MockProvider } = await import('./mock-provider');
const { startWorkerRuntime } = await import('./runtime');

const connection = createRedis('worker-bullmq');
const redis = createRedis('worker');
const provider = new MockProvider(redis, {
  defaultMode: config.MOCK_PROVIDER_MODE,
  flakyFailures: config.MOCK_PROVIDER_FLAKY_FAILURES,
  latencyMs: config.MOCK_PROVIDER_LATENCY_MS,
});

const runtime = startWorkerRuntime({ connection, provider, redis });
logger.info(
  { concurrency: config.WORKER_CONCURRENCY, maxAttempts: config.NOTIFY_MAX_ATTEMPTS, mockMode: config.MOCK_PROVIDER_MODE },
  'worker started',
);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker shutting down (finishing active jobs)');
  const deadline = setTimeout(() => {
    logger.error('worker shutdown timed out; forcing exit');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS + 5000);
  deadline.unref();
  await runtime.stop();
  await Promise.all([connection.quit(), redis.quit()]).catch(() => {});
  await closePool();
  logger.info('worker stopped');
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
