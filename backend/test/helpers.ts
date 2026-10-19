import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_COOKIE } from '../src/auth/guards.js';
import type { Role } from '../src/auth/sessions.js';
import { loadConfig } from '../src/config.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { NotificationJob, NotificationQueue } from '../src/notifications/queue.js';

export const TEST_PASSWORD = 'Correct-Horse-42';
const passwordHash = hashPassword(TEST_PASSWORD);

/** Captures enqueued jobs instead of sending them to Redis, so tests can assert on them. */
export class RecordingQueue implements NotificationQueue {
  readonly jobs: NotificationJob[] = [];
  async enqueue(job: NotificationJob) {
    this.jobs.push(job);
  }
  async close() {}
}

export interface TestAppOptions {
  env?: Record<string, string>;
  realtimeHeartbeatMs?: number;
}

export async function createTestApp({ env = {}, realtimeHeartbeatMs }: TestAppOptions = {}): Promise<FastifyInstance> {
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'fielddesk-uploads-'));
  const config = loadConfig({
    ...process.env,
    LOGIN_RATE_LIMIT_MAX: '1000',
    EVENT_RATE_LIMIT_MAX: '1000',
    UPLOAD_DIR: uploadDir,
    ...env,
  });
  const pool = createPool(process.env.DATABASE_URL!, 20);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  const app = await buildApp({
    config,
    pool,
    redis,
    notificationQueue: new RecordingQueue(),
    rateLimitNamespace: `test-${randomUUID()}:`,
    realtimeHeartbeatMs,
  });
  app.addHook('onClose', async () => {
    await pool.end();
    await redis.quit();
    await rm(uploadDir, { recursive: true, force: true });
  });
  await app.ready();
  return app;
}

export const recordedJobs = (app: FastifyInstance) => (app.notificationQueue as RecordingQueue).jobs;

/** Creates a work order through the API as the given user. */
export async function apiCreateWorkOrder(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; version: number; reference: string; status: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/work-orders',
    headers: { cookie },
    payload: { title: 'Fix boiler', siteName: 'Main site', ...body },
  });
  if (response.statusCode !== 201) throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  return response.json().data;
}

/** A fresh future day per call, so windows within one test file never collide unless intended. */
let dayCounter = 0;
export function futureWindow(hours = 1): { scheduledStart: string; scheduledEnd: string } {
  dayCounter += 1;
  const start = Date.UTC(2031, 0, 1, 9) + dayCounter * 86_400_000;
  return { scheduledStart: new Date(start).toISOString(), scheduledEnd: new Date(start + hours * 3_600_000).toISOString() };
}

/** Connects as the table owner, which bypasses RLS. Used only to arrange fixtures and inspect results. */
export function createOwnerPool(): Pool {
  return createPool(process.env.TEST_MIGRATION_DATABASE_URL!, 5);
}

export interface TestUser {
  id: string;
  email: string;
  role: Role;
}

export interface TestOrg {
  id: string;
  name: string;
  owner: TestUser;
  dispatcher: TestUser;
  technician: TestUser;
}

/** Creates an organisation with one user per role. Emails are unique per call. */
export async function createOrg(ownerPool: Pool, name = `Org ${randomUUID().slice(0, 8)}`): Promise<TestOrg> {
  const hash = await passwordHash;
  const { rows } = await ownerPool.query<{ id: string }>('INSERT INTO organisations (name) VALUES ($1) RETURNING id', [name]);
  const orgId = rows[0]!.id;
  const tag = randomUUID().slice(0, 8);

  const users = {} as Record<Role, TestUser>;
  for (const role of ['owner', 'dispatcher', 'technician'] as const) {
    const email = `${role}-${tag}@example.test`;
    const result = await ownerPool.query<{ id: string }>(
      `INSERT INTO users (org_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, email, `${role} ${tag}`, role, hash],
    );
    users[role] = { id: result.rows[0]!.id, email, role };
  }
  return { id: orgId, name, ...users };
}

/** Logs in through the API and returns a Cookie header value. */
export async function login(app: FastifyInstance, email: string, password = TEST_PASSWORD): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  if (response.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('no session cookie set');
  return `${SESSION_COOKIE}=${cookie.value}`;
}
