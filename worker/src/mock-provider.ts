import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  PermanentProviderError,
  TemporaryProviderError,
  type NotificationProvider,
  type OutboundMessage,
  type SendResult,
} from './provider';

export type MockMode = 'success' | 'temporary_failure' | 'permanent_failure' | 'flaky';
export const MOCK_MODES: MockMode[] = ['success', 'temporary_failure', 'permanent_failure', 'flaky'];

export const MOCK_KEYS = {
  mode: 'mockprovider:mode',
  sent: 'mockprovider:sent',
  idem: (key: string) => `mockprovider:idem:${key}`,
  fails: (key: string) => `mockprovider:fails:${key}`,
};

/**
 * A controllable stand-in for an external provider. State lives in Redis so
 * every worker process sees the same mode and the same "already sent" record.
 *
 * Behaviour, in priority order:
 *  1. Idempotency: a message whose key was already delivered is not sent
 *     again; the original messageId is returned with duplicate=true.
 *  2. Recipient overrides: "+permfail" in the address -> permanent failure;
 *     "+tempfail" -> fails temporarily N times, then succeeds.
 *  3. Global mode (Redis key, set via `npm run mock-provider -- mode <m>`,
 *     falling back to MOCK_PROVIDER_MODE).
 * Every real delivery is appended to the `mockprovider:sent` list, which is
 * what tests and the CLI inspect to count notifications actually produced.
 */
export class MockProvider implements NotificationProvider {
  constructor(
    private readonly redis: Redis,
    private readonly opts: { defaultMode: MockMode; flakyFailures: number; latencyMs: number },
  ) {}

  async send(msg: OutboundMessage, signal: AbortSignal): Promise<SendResult> {
    await sleep(this.opts.latencyMs, signal);

    const previous = await this.redis.get(MOCK_KEYS.idem(msg.idempotencyKey));
    if (previous) return { messageId: previous, duplicate: true };

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.to)) throw new PermanentProviderError(`invalid recipient address "${msg.to}" (simulated 400)`);

    let mode: MockMode = ((await this.redis.get(MOCK_KEYS.mode)) as MockMode | null) ?? this.opts.defaultMode;
    if (msg.to.includes('+permfail')) mode = 'permanent_failure';
    else if (msg.to.includes('+tempfail')) mode = 'flaky';

    switch (mode) {
      case 'temporary_failure':
        throw new TemporaryProviderError('provider unavailable (simulated 503)');
      case 'permanent_failure':
        throw new PermanentProviderError('recipient rejected by provider (simulated 422)');
      case 'flaky': {
        const n = await this.redis.incr(MOCK_KEYS.fails(msg.idempotencyKey));
        await this.redis.expire(MOCK_KEYS.fails(msg.idempotencyKey), 86_400);
        if (n <= this.opts.flakyFailures) {
          throw new TemporaryProviderError(`provider timeout (simulated, failure ${n} of ${this.opts.flakyFailures})`);
        }
        break;
      }
    }

    // Claim the idempotency key atomically; a concurrent duplicate loses here.
    const messageId = `mock-${randomUUID()}`;
    const claimed = await this.redis.set(MOCK_KEYS.idem(msg.idempotencyKey), messageId, 'EX', 7 * 86_400, 'NX');
    if (!claimed) {
      return { messageId: (await this.redis.get(MOCK_KEYS.idem(msg.idempotencyKey))) ?? messageId, duplicate: true };
    }
    await this.redis.rpush(
      MOCK_KEYS.sent,
      JSON.stringify({ messageId, to: msg.to, subject: msg.subject, idempotencyKey: msg.idempotencyKey, at: new Date().toISOString() }),
    );
    return { messageId, duplicate: false };
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new TemporaryProviderError('provider call timed out'));
    }, { once: true });
  });
}
