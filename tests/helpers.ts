import { rm } from 'node:fs/promises';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../backend/src/app';
import { seedDatabase, SEED_PASSWORD, type SeedResult } from '../backend/src/db/seed-data';
import { disableAllFailpoints } from '../backend/src/lib/failpoints';
import { LocalDiskStorage } from '../backend/src/modules/attachments/storage';
import { RealtimeHub } from '../backend/src/modules/realtime/hub';
import { config } from '../shared/config';
import { pool } from '../shared/db';
import { createRedis } from '../shared/redis';

export { pool, SEED_PASSWORD };
export type Agent = ReturnType<typeof request.agent>;
type App = ReturnType<typeof createApp>;

export interface TestContext {
  app: App;
  redis: Redis;
  hub: RealtimeHub;
  storage: LocalDiskStorage;
  close(): Promise<void>;
}

/** A real API instance wired to the real test PostgreSQL and Redis. */
export async function createTestApp(): Promise<TestContext> {
  const storage = new LocalDiskStorage(config.STORAGE_DIR);
  await storage.init();
  const redis = createRedis('test-api');
  const hub = new RealtimeHub(createRedis('test-api-sub'));
  await hub.start();
  const app = createApp({ redis, realtime: hub, storage });
  return {
    app, redis, hub, storage,
    async close() {
      await hub.stop();
      await redis.quit();
    },
  };
}

/** Wipes all data, clears Redis and reseeds both organisations. */
export async function resetData(redis: Redis): Promise<SeedResult> {
  disableAllFailpoints();
  await pool.query(`TRUNCATE audit_log, notification_attempts, notifications, progress_events, attachments,
                    work_orders, sessions, users, organisations RESTART IDENTITY CASCADE`);
  await redis.flushdb();
  await rm(config.STORAGE_DIR, { recursive: true, force: true });
  await new LocalDiskStorage(config.STORAGE_DIR).init();
  return seedDatabase(pool);
}

/** Logs in through the real endpoint and returns an agent that carries the session cookie. */
export async function loginAs(app: App, email: string, password = SEED_PASSWORD): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 10_000, intervalMs = 25): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const hour = 3600_000;
/** A scheduling window relative to a fixed base far in the future, so it never clashes with seed data. */
export function window(startHour: number, endHour: number) {
  const base = Date.UTC(2030, 0, 1);
  return {
    scheduledStart: new Date(base + startHour * hour).toISOString(),
    scheduledEnd: new Date(base + endHour * hour).toISOString(),
  };
}

export async function createWorkOrder(agent: Agent, overrides: Record<string, unknown> = {}) {
  const res = await agent.post('/api/work-orders').send({
    title: 'Test work order',
    description: 'Created by the test suite',
    priority: 'medium',
    siteName: 'Test Site',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; reference: string; version: number; status: string };
}
