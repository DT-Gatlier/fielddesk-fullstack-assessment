import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'temporary' | 'permanent',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface NotificationMessage {
  /** Passed to the provider so a retried send after a crash does not deliver twice. */
  idempotencyKey: string;
  to: string;
  subject: string;
  body: string;
}

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<{ messageId: string }>;
}

export const MOCK_PROVIDER_MODES = ['success', 'temporary_failure', 'permanent_failure', 'fail_twice'] as const;
export type MockProviderMode = (typeof MOCK_PROVIDER_MODES)[number];

export const MOCK_MODE_KEY = 'fielddesk:mock-provider:mode';
const sentKey = (key: string) => `fielddesk:mock-provider:sent:${key}`;
const deliveriesKey = (key: string) => `fielddesk:mock-provider:deliveries:${key}`;
const attemptsKey = (key: string) => `fielddesk:mock-provider:attempts:${key}`;

/**
 * Stand-in for an SMS/email/push provider. Its behaviour is switched at runtime through Redis (see
 * PUT /api/dev/mock-provider), so success and both failure kinds can be demonstrated without
 * restarting anything:
 *
 *   success            - accepts every message
 *   temporary_failure  - fails every attempt with a retryable error (e.g. HTTP 503)
 *   permanent_failure  - rejects every message as invalid (e.g. HTTP 400); never retried
 *   fail_twice         - fails the first two attempts for each message, then succeeds
 *
 * Like real providers it honours an idempotency key: a repeat send returns the original message id
 * without delivering again. `deliveries` counts real deliveries so tests can assert exactly-once.
 */
export class MockProvider implements NotificationProvider {
  constructor(
    private readonly redis: Redis,
    private readonly defaultMode: MockProviderMode,
    private readonly latencyMs = 50,
  ) {}

  async mode(): Promise<MockProviderMode> {
    const value = await this.redis.get(MOCK_MODE_KEY);
    return (MOCK_PROVIDER_MODES as readonly string[]).includes(value ?? '') ? (value as MockProviderMode) : this.defaultMode;
  }

  async send(message: NotificationMessage): Promise<{ messageId: string }> {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));

    const previous = await this.redis.get(sentKey(message.idempotencyKey));
    if (previous) return { messageId: previous };

    const attempt = await this.redis.incr(attemptsKey(message.idempotencyKey));
    await this.redis.expire(attemptsKey(message.idempotencyKey), 86_400);

    switch (await this.mode()) {
      case 'temporary_failure':
        throw new ProviderError('provider unavailable (simulated 503)', 'temporary');
      case 'permanent_failure':
        throw new ProviderError('recipient rejected (simulated 400)', 'permanent');
      case 'fail_twice':
        if (attempt <= 2) throw new ProviderError(`provider timeout (simulated, attempt ${attempt})`, 'temporary');
        break;
      case 'success':
        break;
    }

    const messageId = `mock-${randomUUID()}`;
    const stored = await this.redis.set(sentKey(message.idempotencyKey), messageId, 'EX', 7 * 86_400, 'NX');
    if (stored === null) {
      // Lost a race with a concurrent send of the same key: report the winner's id, deliver nothing.
      return { messageId: (await this.redis.get(sentKey(message.idempotencyKey)))! };
    }
    await this.redis.incr(deliveriesKey(message.idempotencyKey));
    return { messageId };
  }

  async deliveries(idempotencyKey: string): Promise<number> {
    return Number((await this.redis.get(deliveriesKey(idempotencyKey))) ?? 0);
  }
}
