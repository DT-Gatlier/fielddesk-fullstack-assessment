import argon2 from 'argon2';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { Config } from '../../config.js';
import type { Database } from '../../database/pool.js';

const config: Config = {
  NODE_ENV: 'test', PORT: 8000, DATABASE_URL: 'postgres://unused', REDIS_URL: 'redis://unused',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long', JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_DAYS: 7,
  CORS_ORIGIN: 'http://localhost:5173', UPLOAD_DIR: '/tmp/fielddesk-test-uploads',
  MAX_UPLOAD_BYTES: 1024, DEFAULT_ORG_STORAGE_LIMIT_BYTES: 10_000, CACHE_TTL_SECONDS: 30,
  NOTIFICATION_QUEUE_NAME: 'test', NOTIFICATION_MAX_ATTEMPTS: 5, NOTIFICATION_BACKOFF_MS: 10,
  OUTBOX_POLL_MS: 1000, MOCK_NOTIFICATION_MODE: 'success', LOG_LEVEL: 'silent'
};

let passwordHash: string;
beforeAll(async () => { passwordHash = await argon2.hash('FieldDesk123!'); });

function databaseReturning(rows: unknown[]): Database {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) } as unknown as Database;
}

describe('authentication API', () => {
  it('returns a signed access token for valid credentials', async () => {
    const database = databaseReturning([{ id: '10000000-0000-4000-8000-000000000001', organisation_id: '10000000-0000-4000-8000-000000000002', name: 'Owner', email: 'owner@northwind.test', password_hash: passwordHash, role: 'owner', token_version: 0 }]);
    const response = await request(createApp(database, config)).post('/api/v1/auth/login').send({ organisation: 'northwind', email: 'owner@northwind.test', password: 'FieldDesk123!' });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).not.toHaveProperty('password_hash');
  });

  it('does not reveal whether an account exists', async () => {
    const database = databaseReturning([]);
    const response = await request(createApp(database, config)).post('/api/v1/auth/login').send({ organisation: 'northwind', email: 'nobody@northwind.test', password: 'FieldDesk123!' });
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: 'UNAUTHORISED', message: 'Invalid organisation, email, or password' });
  });
});
