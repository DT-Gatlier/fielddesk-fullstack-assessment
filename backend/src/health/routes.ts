import type { FastifyInstance } from 'fastify';

async function check(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<'ok' | 'fail'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: the process is running and serving HTTP. No dependency checks, so a database outage
  // does not cause the orchestrator to restart healthy API processes.
  app.get('/health/live', async () => ({ status: 'ok' }));

  // Readiness: safe to route traffic here. Fails while dependencies are down or during shutdown.
  app.get('/health/ready', async (_request, reply) => {
    const checks = {
      database: await check(() => app.pg.query('SELECT 1')),
      redis: await check(() => app.redis.ping()),
    };
    const ready = !app.shuttingDown && Object.values(checks).every((status) => status === 'ok');
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      shuttingDown: app.shuttingDown,
      checks,
    });
  });
}
