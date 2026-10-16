/**
 * Control the mock notification provider while the stack is running.
 *   npm run mock-provider -- mode success|temporary_failure|permanent_failure|flaky
 *   npm run mock-provider -- status
 *   npm run mock-provider -- sent        (list delivered messages)
 *   npm run mock-provider -- reset       (clear mode override, sent log, idempotency keys)
 * In Docker: docker compose exec worker node dist/mock-provider-cli.js mode flaky
 */
export {};
process.env.LOG_LEVEL ??= 'warn';
const { createRedis } = await import('../../shared/redis');
const { MOCK_KEYS, MOCK_MODES } = await import('./mock-provider');

const [cmd, arg] = process.argv.slice(2);
const redis = createRedis('mock-provider-cli');
try {
  switch (cmd) {
    case 'mode':
      if (!MOCK_MODES.includes(arg as never)) throw new Error(`mode must be one of: ${MOCK_MODES.join(', ')}`);
      await redis.set(MOCK_KEYS.mode, arg!);
      console.log(`mock provider mode set to "${arg}"`);
      break;
    case 'status':
      console.log({
        mode: (await redis.get(MOCK_KEYS.mode)) ?? `(not set: MOCK_PROVIDER_MODE=${process.env.MOCK_PROVIDER_MODE ?? 'success'})`,
        delivered: await redis.llen(MOCK_KEYS.sent),
      });
      break;
    case 'sent':
      for (const m of await redis.lrange(MOCK_KEYS.sent, 0, -1)) console.log(m);
      break;
    case 'reset': {
      const keys = await redis.keys('mockprovider:*');
      if (keys.length) await redis.del(...keys);
      console.log(`cleared ${keys.length} mock provider keys`);
      break;
    }
    default:
      console.log('usage: mock-provider mode <mode> | status | sent | reset');
      process.exitCode = 1;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await redis.quit();
}
