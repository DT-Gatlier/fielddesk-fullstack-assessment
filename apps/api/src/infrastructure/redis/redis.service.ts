import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import type { ApiEnvironment } from '../../config/environment';

// Both counters and their expiries change in one Redis operation.
const LOGIN_LIMIT = `
local blocked = 0
for i = 1, 2 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 or redis.call('PTTL', KEYS[i]) < 0 then
    redis.call('PEXPIRE', KEYS[i], ARGV[i * 2])
  end
  if count > tonumber(ARGV[i * 2 - 1]) then
    blocked = math.max(blocked, redis.call('PTTL', KEYS[i]))
  end
end
return blocked`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private readonly prefix: string;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.prefix = config.get('REDIS_KEY_PREFIX', { infer: true });
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 2000,
      disconnectTimeout: 2000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      connectionName: `${this.prefix}:security:${randomUUID()}`,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2000),
    });
    // Driver errors may contain connection details. Request failures are sanitized.
    this.client.on('error', () => undefined);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.ping();
    } catch {
      await this.onModuleDestroy();
      throw new Error(
        'Redis initialization failed; check service availability and configuration',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    await new Promise<void>((resolve) => {
      this.client.once('end', resolve);
      this.client.disconnect();
    });
  }

  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ServiceUnavailableException('Security service unavailable');
    }
  }

  key(suffix: string): string {
    return `${this.prefix}:${suffix}`;
  }

  getAnonymous(identifierHash: string): Promise<string | null> {
    return this.safe(() => this.client.get(this.key(`csrf:${identifierHash}`)));
  }

  async setAnonymous(identifierHash: string, token: string): Promise<void> {
    await this.safe(() =>
      this.client.set(this.key(`csrf:${identifierHash}`), token, 'EX', 600),
    );
  }

  async deleteAnonymous(identifierHash: string): Promise<void> {
    await this.safe(() => this.client.del(this.key(`csrf:${identifierHash}`)));
  }

  async loginLimit(ipHash: string, emailHash: string): Promise<number> {
    const milliseconds = await this.safe(() =>
      this.client.eval(
        LOGIN_LIMIT,
        2,
        this.key(`login:ip:${ipHash}`),
        this.key(`login:email:${emailHash}`),
        20,
        60000,
        5,
        900000,
      ),
    );
    return Math.ceil(Number(milliseconds) / 1000);
  }

  async ping(): Promise<void> {
    await this.safe(() => this.client.ping());
  }
}
