import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

import type { ApiEnvironment } from '../../config/environment';

export interface RedisMessage {
  channel: string;
  message: string;
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly prefix: string;
  private readonly message$ = new Subject<RedisMessage>();
  private readonly activeChannels = new Map<string, number>();

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.prefix = config.get('REDIS_KEY_PREFIX', { infer: true });
    const redisUrl = config.get('REDIS_URL', { infer: true });

    const clientOptions = {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 2000,
      disconnectTimeout: 2000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: (attempt: number) => Math.min(attempt * 250, 2000),
    };

    this.publisher = new Redis(redisUrl, {
      ...clientOptions,
      connectionName: `${this.prefix}:pub:${randomUUID()}`,
    });

    this.subscriber = new Redis(redisUrl, {
      ...clientOptions,
      connectionName: `${this.prefix}:sub:${randomUUID()}`,
    });

    // Suppress unhandled driver error logs containing raw URLs
    this.publisher.on('error', (err: Error) => {
      this.logger.warn(`Redis publisher error: ${err.message}`);
    });
    this.subscriber.on('error', (err: Error) => {
      this.logger.warn(`Redis subscriber error: ${err.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);
      await Promise.all([
        this.publisher.ping(),
        this.subscriber.ping(),
      ]);

      this.subscriber.on('message', (channel: string, message: string) => {
        this.message$.next({ channel, message });
      });

      this.logger.log('Redis Pub/Sub publisher and subscriber connections established.');
    } catch {
      await this.onModuleDestroy();
      throw new Error(
        'Redis Pub/Sub initialization failed; check service availability and configuration',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const closes: Promise<void>[] = [];

    if (this.publisher.status !== 'end') {
      closes.push(
        new Promise<void>((resolve) => {
          this.publisher.once('end', resolve);
          this.publisher.disconnect();
        }),
      );
    }

    if (this.subscriber.status !== 'end') {
      closes.push(
        new Promise<void>((resolve) => {
          this.subscriber.once('end', resolve);
          this.subscriber.disconnect();
        }),
      );
    }

    await Promise.all(closes);
    this.message$.complete();
  }

  getChannelName(organisationId: string): string {
    return `${this.prefix}:events:org:${organisationId}`;
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    try {
      const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
      await this.publisher.publish(channel, data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown Redis publish failure';
      this.logger.warn(`Failed to publish message to channel ${channel}: ${msg}`);
    }
  }

  subscribe(channel: string): Observable<string> {
    return new Observable<string>((observer) => {
      const currentCount = this.activeChannels.get(channel) ?? 0;
      this.activeChannels.set(channel, currentCount + 1);

      if (currentCount === 0) {
        this.subscriber.subscribe(channel).catch((err: Error) => {
          this.logger.warn(`Failed to subscribe to channel ${channel}: ${err.message}`);
        });
      }

      const subscription = this.message$
        .pipe(filter((msg) => msg.channel === channel))
        .subscribe({
          next: (msg) => observer.next(msg.message),
          error: (err: unknown) => observer.error(err),
        });

      return () => {
        subscription.unsubscribe();
        const updatedCount = (this.activeChannels.get(channel) ?? 1) - 1;
        if (updatedCount <= 0) {
          this.activeChannels.delete(channel);
          this.subscriber.unsubscribe(channel).catch((err: Error) => {
            this.logger.warn(`Failed to unsubscribe from channel ${channel}: ${err.message}`);
          });
        } else {
          this.activeChannels.set(channel, updatedCount);
        }
      };
    });
  }
}
