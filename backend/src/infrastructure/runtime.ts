import type { Response } from 'express';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';

export interface DomainEvent {
  id: string;
  type: string;
  organisationId: string;
  occurredAt: string;
  data: unknown;
}

export interface RuntimeServices {
  readonly ready: boolean;
  getCached<T>(key: string): Promise<T | null>;
  setCached(key: string, value: unknown): Promise<void>;
  getOrganisationCacheVersion(organisationId: string): Promise<string>;
  publish(organisationId: string, type: string, data: unknown): Promise<void>;
  attachEventStream(organisationId: string, response: Response): () => void;
  close(): Promise<void>;
}

const channel = (organisationId: string) => `fielddesk:events:${organisationId}`;

export class RedisRuntime implements RuntimeServices {
  private readonly client: Redis;
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly clients = new Map<string, Set<Response>>();
  private connected = false;

  constructor(private readonly config: Config) {
    const options = { maxRetriesPerRequest: 1, enableReadyCheck: true, lazyConnect: true };
    this.client = new Redis(config.REDIS_URL, options);
    this.publisher = new Redis(config.REDIS_URL, options);
    this.subscriber = new Redis(config.REDIS_URL, options);
    for (const connection of [this.client, this.publisher, this.subscriber]) {
      connection.on('error', (error) => { this.connected = false; console.error(JSON.stringify({ level: 'error', message: 'Redis connection error', error: error.message })); });
    }
  }

  get ready() { return this.connected; }

  async start(): Promise<void> {
    await Promise.all([this.client.connect(), this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.psubscribe('fielddesk:events:*');
    this.subscriber.on('pmessage', (_pattern: string, redisChannel: string, message: string) => {
      const organisationId = redisChannel.slice('fielddesk:events:'.length);
      this.deliver(organisationId, message);
    });
    this.connected = true;
  }

  async getCached<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      const value = await this.client.get(`fielddesk:cache:${key}`);
      return value ? JSON.parse(value) as T : null;
    } catch { return null; }
  }

  async setCached(key: string, value: unknown): Promise<void> {
    if (!this.connected) return;
    try { await this.client.set(`fielddesk:cache:${key}`, JSON.stringify(value), 'EX', this.config.CACHE_TTL_SECONDS); }
    catch { /* Cache failures must not fail the request. */ }
  }

  async getOrganisationCacheVersion(organisationId: string): Promise<string> {
    if (!this.connected) return '0';
    try { return await this.client.get(`fielddesk:cache-version:${organisationId}`) ?? '0'; }
    catch { return '0'; }
  }

  async publish(organisationId: string, type: string, data: unknown): Promise<void> {
    const event: DomainEvent = { id: randomUUID(), type, organisationId, occurredAt: new Date().toISOString(), data };
    const message = JSON.stringify(event);
    if (this.connected) {
      try {
        await Promise.all([
          this.client.incr(`fielddesk:cache-version:${organisationId}`),
          this.publisher.publish(channel(organisationId), message)
        ]);
        return;
      } catch { this.connected = false; /* Fall through to local best-effort delivery. */ }
    }
    this.deliver(organisationId, message);
  }

  attachEventStream(organisationId: string, response: Response): () => void {
    let organisationClients = this.clients.get(organisationId);
    if (!organisationClients) { organisationClients = new Set(); this.clients.set(organisationId, organisationClients); }
    organisationClients.add(response);
    return () => {
      organisationClients?.delete(response);
      if (organisationClients?.size === 0) this.clients.delete(organisationId);
    };
  }

  private deliver(organisationId: string, message: string) {
    for (const response of this.clients.get(organisationId) ?? []) response.write(`data: ${message}\n\n`);
  }

  async close(): Promise<void> {
    this.connected = false;
    await Promise.allSettled([this.client.quit(), this.publisher.quit(), this.subscriber.quit()]);
  }
}

export const noOpRuntime: RuntimeServices = {
  ready: false,
  async getCached() { return null; },
  async setCached() {},
  async getOrganisationCacheVersion() { return '0'; },
  async publish() {},
  attachEventStream() { return () => undefined; },
  async close() {}
};
