import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { Config } from '../config.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const database = testDatabaseUrl ? new pg.Pool({ connectionString: testDatabaseUrl, max: 10 }) : undefined;
const config: Config = {
  NODE_ENV: 'test', PORT: 8000, DATABASE_URL: testDatabaseUrl ?? 'postgres://unused', REDIS_URL: 'redis://unused',
  JWT_SECRET: 'integration-secret-at-least-thirty-two-characters', JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_DAYS: 7,
  CORS_ORIGIN: 'http://localhost:5173', UPLOAD_DIR: '/tmp/fielddesk-integration-uploads', MAX_UPLOAD_BYTES: 1024,
  DEFAULT_ORG_STORAGE_LIMIT_BYTES: 10_000, CACHE_TTL_SECONDS: 30, NOTIFICATION_QUEUE_NAME: 'test-notifications',
  NOTIFICATION_MAX_ATTEMPTS: 5, NOTIFICATION_BACKOFF_MS: 10, OUTBOX_POLL_MS: 1000,
  MOCK_NOTIFICATION_MODE: 'success', LOG_LEVEL: 'silent'
};

let organisationId: string;
let otherOrganisationId: string;
let ownerId: string;
let technicianId: string;
let otherTechnicianId: string;

function accessToken(userId: string, orgId: string, role: 'owner' | 'technician') {
  return jwt.sign({ organisationId: orgId, role, tokenVersion: 0 }, config.JWT_SECRET, {
    algorithm: 'HS256', issuer: 'fielddesk-api', audience: 'fielddesk-web', subject: userId, expiresIn: '15m'
  });
}

integrationDescribe('PostgreSQL tenant and concurrency behaviour', () => {
  beforeEach(async () => {
    organisationId = randomUUID(); otherOrganisationId = randomUUID(); ownerId = randomUUID(); technicianId = randomUUID(); otherTechnicianId = randomUUID();
    await database!.query(`INSERT INTO organisations (id, name, slug) VALUES ($1, 'Integration A', $2), ($3, 'Integration B', $4)`, [organisationId, `integration-${organisationId}`, otherOrganisationId, `integration-${otherOrganisationId}`]);
    await database!.query(`INSERT INTO users (id, organisation_id, name, email, password_hash, role) VALUES ($1, $2, 'Owner', 'owner@test', 'unused', 'owner'), ($3, $2, 'Tech', 'tech@test', 'unused', 'technician'), ($4, $5, 'Other Tech', 'tech@test', 'unused', 'technician')`, [ownerId, organisationId, technicianId, otherTechnicianId, otherOrganisationId]);
  });

  afterEach(async () => { await database!.query('DELETE FROM organisations WHERE id = ANY($1::uuid[])', [[organisationId, otherOrganisationId]]); });
  afterAll(async () => { await database?.end(); });

  it('allows only one of two concurrent overlapping assignments', async () => {
    const insert = (reference: string) => database!.query(`INSERT INTO work_orders (organisation_id, reference_number, title, status, assigned_technician_id, scheduled_start, scheduled_end, site_name, created_by_id) VALUES ($1, $2, 'Concurrent assignment', 'scheduled', $3, '2026-10-01T09:00:00Z', '2026-10-01T11:00:00Z', 'Test Site', $4)`, [organisationId, reference, technicianId, ownerId]);
    const outcomes = await Promise.allSettled([insert('CONCURRENT-A'), insert('CONCURRENT-B')]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as { code: string }).code).toBe('23P01');
  });

  it('processes simultaneous duplicate progress events once and hides cross-tenant records', async () => {
    const workOrderId = randomUUID();
    await database!.query(`INSERT INTO work_orders (id, organisation_id, reference_number, title, status, assigned_technician_id, scheduled_start, scheduled_end, site_name, created_by_id) VALUES ($1, $2, 'EVENT-1', 'Event work', 'scheduled', $3, '2026-10-02T09:00:00Z', '2026-10-02T11:00:00Z', 'Test Site', $4)`, [workOrderId, organisationId, technicianId, ownerId]);
    const app = createApp(database!, config);
    const body = { eventId: `evt-${randomUUID()}`, workOrderId, type: 'status_changed', occurredAt: new Date().toISOString(), payload: { status: 'in_progress', note: 'Started' } };
    const token = accessToken(technicianId, organisationId, 'technician');
    const results = await Promise.all([
      request(app).post('/api/v1/progress-events').set('authorization', `Bearer ${token}`).send(body),
      request(app).post('/api/v1/progress-events').set('authorization', `Bearer ${token}`).send(body)
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 201]);
    const count = await database!.query<{ count: string }>('SELECT count(*) FROM progress_events WHERE organisation_id = $1 AND event_id = $2', [organisationId, body.eventId]);
    expect(Number(count.rows[0]?.count)).toBe(1);

    const otherToken = accessToken(otherTechnicianId, otherOrganisationId, 'technician');
    const hidden = await request(app).get(`/api/v1/work-orders/${workOrderId}`).set('authorization', `Bearer ${otherToken}`);
    expect(hidden.status).toBe(404);
  });
});
