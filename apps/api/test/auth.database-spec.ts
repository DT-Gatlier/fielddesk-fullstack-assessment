import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Logger,
} from '@nestjs/common';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response as TestResponse } from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '@fielddesk/database';
import { hash, argon2id } from 'argon2';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/http/configure-app';
import {
  CurrentIdentity,
  RequirePermission,
} from '../src/http/decorators/auth.decorators';
import type { Identity } from '../src/modules/auth/interfaces/auth-identity.interface';
import { AUTH_REPOSITORY } from '../src/modules/auth/interfaces/auth-repository.interface';
import type { AuthRepositoryPort } from '../src/modules/auth/interfaces/auth-repository.interface';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { digest, randomToken } from '../src/modules/auth/utils/token.util';
import { RedisService } from '../src/infrastructure/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';

// Only this test module exposes resource and permission probes.
@Controller('api/v1/test')
class SecurityProbe {
  constructor(private readonly auth: AuthService) {}
  @Get('users/:id')
  @RequirePermission('users:manage')
  user(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.findTenantUser(
      { organisationId: identity.organisation.id },
      id,
    );
  }
  @Get('dispatch')
  @RequirePermission('work:manage')
  dispatch() {
    return { allowed: true };
  }
  @Post('progress')
  @RequirePermission('progress:write')
  progress() {
    return { allowed: true };
  }
}

const origin = 'http://localhost:3000';
const password = 'FieldDeskDemo!2026';
const runId = randomUUID();
const fixtureEmail = (role: string, region: string) =>
  `${role}.${region}.${runId}@fielddesk.example`;
const northOwner = fixtureEmail('owner', 'north');
const prefix = process.env.REDIS_KEY_PREFIX!;
const client = createDatabaseClient(process.env.TEST_DATABASE_URL!);
const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  connectTimeout: 5000,
  commandTimeout: 2000,
  maxRetriesPerRequest: 0,
});
redis.on('error', () => undefined);
const logs: string[] = [];
const logger: LoggerService = {
  log: (message: unknown) => {
    logs.push(String(message));
  },
  warn: () => undefined,
  error: () => undefined,
};
type Browser = { cookies: string[]; csrf: string };
function body(response: TestResponse): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}
function cookieHeaders(response: TestResponse): string[] {
  const values: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? [values]
      : [];
  return headers.filter(
    (value: unknown): value is string => typeof value === 'string',
  );
}
function cookies(response: TestResponse): string[] {
  return cookieHeaders(response)
    .filter((value) => !value.includes('Expires=Thu, 01 Jan 1970'))
    .map((value) => value.split(';')[0]);
}
async function scan(pattern: string): Promise<string[]> {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys;
}

describe('Authentication HTTP integration with PostgreSQL and Redis', () => {
  let app: INestApplication<App>;
  let second: INestApplication<App>;
  let auth: AuthService;
  const sessionHashes = new Set<string>();
  const organisationIds: string[] = [];
  async function makeApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [SecurityProbe],
    }).compile();
    const application = module.createNestApplication<INestApplication<App>>({
      bodyParser: false,
    });
    application.useLogger(logger);
    configureApp(application);
    await application.init();
    return application;
  }
  async function bootstrap(
    application = app,
    existingCookies: string[] = [],
  ): Promise<Browser> {
    const response = await request(application.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', existingCookies)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return {
      cookies: cookies(response).length ? cookies(response) : existingCookies,
      csrf: body(response).csrfToken as string,
    };
  }
  async function login(
    email = northOwner,
    application = app,
  ): Promise<Browser> {
    const anonymous = await bootstrap(application);
    const response = await request(application.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', anonymous.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', anonymous.csrf)
      .send({ email, password })
      .expect(200);
    const sessionCookies = cookies(response);
    const token = sessionCookies
      .find((value) => value.startsWith('fielddesk_session='))!
      .split('=')[1];
    sessionHashes.add(digest(token));
    return bootstrap(application, sessionCookies);
  }
  async function loginAcrossCredentialChange(
    change: () => Promise<void>,
  ): Promise<TestResponse> {
    const anonymous = await bootstrap();
    let signal!: () => void;
    let release!: () => void;
    const arrived = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // This test seam pauses the real repository transaction after password verification.
    const repository = app.get<AuthRepositoryPort>(AUTH_REPOSITORY);
    const issue = repository.issueSession.bind(repository);
    const spy = jest
      .spyOn(repository, 'issueSession')
      .mockImplementation(async (input) => {
        signal();
        await gate;
        return issue(input);
      });
    try {
      const pending = request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', anonymous.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', anonymous.csrf)
        .send({ email: northOwner, password })
        .then((response) => response);
      await arrived;
      try {
        await change();
      } finally {
        release();
      }
      return await pending;
    } finally {
      release();
      spy.mockRestore();
    }
  }
  beforeAll(async () => {
    await redis.connect();
    await client.$connect();
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const region of ['north', 'south']) {
      const organisation = await client.organisation.create({
        data: { slug: `auth-${region}-${runId}`, name: `Auth test ${region}` },
      });
      organisationIds.push(organisation.id);
      for (const role of ['OWNER', 'DISPATCHER', 'TECHNICIAN'] as const) {
        await client.user.create({
          data: {
            organisationId: organisation.id,
            name: `${region} ${role}`,
            email: fixtureEmail(role.toLowerCase(), region),
            passwordHash,
            role,
          },
        });
      }
    }
    app = await makeApp();
    second = await makeApp();
    auth = app.get(AuthService);
  });
  beforeEach(async () => {
    const keys = await scan(`${prefix}:login:*`);
    if (keys.length) {
      await redis.del(...keys);
    }
  });
  afterAll(async () => {
    await app?.close();
    await second?.close();
    await client.session.deleteMany({
      where: { tokenHash: { in: [...sessionHashes] } },
    });
    await client.user.deleteMany({
      where: { organisationId: { in: organisationIds } },
    });
    await client.organisation.deleteMany({
      where: { id: { in: organisationIds } },
    });
    await client.$disconnect();
    const keys = await scan(`${prefix}:*`);
    if (keys.length) {
      await redis.del(...keys);
    }
    redis.disconnect();
    Logger.overrideLogger(false);
  });

  it('logs in six isolated fixtures with all seeded roles and returns safe identities and tenant organisations', async () => {
    for (const region of ['north', 'south']) {
      for (const role of ['owner', 'dispatcher', 'technician']) {
        const browser = await login(fixtureEmail(role, region));
        const response = await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Cookie', browser.cookies)
          .expect(200);
        const user = body(response).user as Identity;
        expect(user.role).toBe(role.toUpperCase());
        expect(Object.keys(user).sort()).toEqual([
          'email',
          'id',
          'name',
          'organisation',
          'role',
        ]);
        const organisation = await request(app.getHttpServer())
          .get('/api/v1/organisation')
          .query({ organisationId: randomUUID() })
          .set('Cookie', browser.cookies)
          .expect(200);
        expect(body(organisation).id).toBe(user.organisation.id);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    }
  });
  it('normalizes email, persists only the session hash and sets safe cookies', async () => {
    const anonymous = await bootstrap();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', anonymous.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', anonymous.csrf)
      .send({ email: ` ${northOwner.toUpperCase()} `, password })
      .expect(200);
    const rawCookie = cookieHeaders(response).find((value) =>
      value.startsWith('fielddesk_session='),
    )!;
    expect(rawCookie).toContain('HttpOnly');
    expect(rawCookie).toContain('SameSite=Lax');
    expect(rawCookie).toContain('Path=/api/v1');
    expect(rawCookie).toContain('Expires=');
    expect(rawCookie).not.toContain('Domain=');
    const token = rawCookie.split(';')[0].split('=')[1];
    sessionHashes.add(digest(token));
    const row = await client.session.findUniqueOrThrow({
      where: { tokenHash: digest(token) },
    });
    expect(row.tokenHash).not.toBe(token);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(
      28790000,
    );
    expect(JSON.stringify(body(response))).not.toMatch(
      /passwordHash|tokenHash|authVersion|csrfToken/,
    );
  });
  it('returns equivalent generic failures for unknown email and incorrect password', async () => {
    const browser = await bootstrap();
    const messages: unknown[] = [];
    for (const email of [northOwner, 'missing@fielddesk.example']) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', browser.csrf)
        .send({ email, password: 'secret_invalid_marker' })
        .expect(401);
      messages.push(body(response).message);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(messages).toEqual([
      'Invalid email or password',
      'Invalid email or password',
    ]);
  });

  it('does not trim passwords and sets Secure cookies when configured', async () => {
    const user = await client.user.findUniqueOrThrow({
      where: { email: northOwner },
    });
    const changedHash = await hash(` ${password} `);
    await client.user.update({
      where: { id: user.id },
      data: { passwordHash: changedHash },
    });
    const settings = app.get(ConfigService);
    settings.set('COOKIE_SECURE', true);
    try {
      const browser = await bootstrap();
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', browser.csrf)
        .send({ email: northOwner, password })
        .expect(401);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', browser.csrf)
        .send({ email: northOwner, password: ` ${password} ` })
        .expect(200);
      const sessionCookie = cookieHeaders(response).find((value) =>
        value.startsWith('fielddesk_session='),
      )!;
      expect(sessionCookie).toContain('Secure');
      sessionHashes.add(digest(sessionCookie.split(';')[0].split('=')[1]));
    } finally {
      settings.set('COOKIE_SECURE', false);
      await client.user.update({
        where: { id: user.id },
        data: { passwordHash: user.passwordHash },
      });
    }
  });
  it('rejects unknown authority fields, invalid lengths and oversized JSON before password verification', async () => {
    const spy = jest.spyOn(app.get(AuthService), 'login');
    const browser = await bootstrap();
    for (const input of [
      {
        email: northOwner,
        password,
        role: 'OWNER',
        organisationId: randomUUID(),
      },
      { email: `${'a'.repeat(255)}@example.com`, password },
      { email: northOwner, password: '' },
      { email: northOwner, password: 'a'.repeat(129) },
      { email: northOwner, password: 123 },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', browser.csrf)
        .send(input)
        .expect(400);
    }
    const oversized = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ password: 'secret_body_marker'.repeat(2000) })
      .expect(413);
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('requires origin and CSRF and rejects the old anonymous token after login', async () => {
    const anonymous = await bootstrap();
    for (const value of ['', 'null', 'https://evil.example']) {
      const call = request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', anonymous.cookies)
        .set('X-CSRF-Token', anonymous.csrf);
      if (value) {
        call.set('Origin', value);
      }
      await call.send({ email: northOwner, password }).expect(403);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Cookie', anonymous.cookies)
      .send({ email: northOwner, password })
      .expect(403);
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Cookie', anonymous.cookies)
      .set('X-CSRF-Token', anonymous.csrf)
      .send({ email: northOwner, password })
      .expect(200);
    const signedIn = cookies(loginResponse);
    sessionHashes.add(digest(signedIn[0].split('=')[1]));
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', signedIn)
      .set('X-CSRF-Token', anonymous.csrf)
      .expect(403);
    const fresh = await bootstrap(app, signedIn);
    expect(fresh.csrf).not.toBe(anonymous.csrf);
    expect((await bootstrap(app, signedIn)).csrf).toBe(fresh.csrf);
    expect(
      await redis.get(
        `${prefix}:csrf:${digest(anonymous.cookies[0].split('=')[1])}`,
      ),
    ).toBeNull();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', fresh.cookies)
      .set('X-CSRF-Token', fresh.csrf)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', signedIn)
      .expect(401);
  });
  it('rotates sessions on another login and rejects the previous session', async () => {
    const browser = await login();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', browser.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', browser.csrf)
      .send({ email: northOwner, password })
      .expect(200);
    sessionHashes.add(digest(cookies(response)[0].split('=')[1]));
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', browser.cookies)
      .expect(401);
  });
  it('recovers unknown, expired, revoked and version-mismatched cookies and allows protected anonymous logout', async () => {
    for (const mode of ['unknown', 'expired', 'revoked', 'version']) {
      const browser =
        mode === 'unknown'
          ? { cookies: [`fielddesk_session=${randomToken()}`], csrf: '' }
          : await login();
      if (mode !== 'unknown') {
        const tokenHash = digest(browser.cookies[0].split('=')[1]);
        if (mode === 'expired') {
          await client.session.update({
            where: { tokenHash },
            data: {
              createdAt: new Date(Date.now() - 10000),
              expiresAt: new Date(Date.now() - 1000),
            },
          });
        }
        if (mode === 'revoked') {
          await client.session.update({
            where: { tokenHash },
            data: { revokedAt: new Date() },
          });
        }
        if (mode === 'version') {
          await client.session.update({
            where: { tokenHash },
            data: { authVersion: 999999 },
          });
        }
      }
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', browser.cookies)
        .expect(401);
      const recovered = await bootstrap(app, browser.cookies);
      expect(recovered.cookies[0]).toMatch(/^fielddesk_anonymous=/);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('Cookie', recovered.cookies)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('Cookie', recovered.cookies)
        .set('X-CSRF-Token', recovered.csrf)
        .expect(204);
    }
  });
  it('enforces live roles and rejects foreign-tenant resource IDs', async () => {
    const owner = await login();
    const dispatcher = await login(fixtureEmail('dispatcher', 'north'));
    const technician = await login(fixtureEmail('technician', 'north'));
    for (const browser of [owner, dispatcher]) {
      await request(app.getHttpServer())
        .get('/api/v1/test/dispatch')
        .set('Cookie', browser.cookies)
        .expect(200);
    }
    await request(app.getHttpServer())
      .get('/api/v1/test/dispatch')
      .set('Cookie', technician.cookies)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/test/progress')
      .set('Cookie', technician.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', technician.csrf)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/test/progress')
      .set('Cookie', dispatcher.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', dispatcher.csrf)
      .send({})
      .expect(403);
    const foreign = await client.user.findUniqueOrThrow({
      where: { email: fixtureEmail('owner', 'south') },
    });
    const own = await client.user.findUniqueOrThrow({
      where: { email: northOwner },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/test/users/${own.id}`)
      .set('Cookie', owner.cookies)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/test/users/${foreign.id}`)
      .set('Cookie', owner.cookies)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/test/users/${own.id}`)
      .set('Cookie', dispatcher.cookies)
      .expect(403);
    await client.user.update({
      where: { id: own.id },
      data: { role: 'TECHNICIAN' },
    });
    try {
      await request(app.getHttpServer())
        .get('/api/v1/test/dispatch')
        .set('Cookie', owner.cookies)
        .expect(403);
    } finally {
      await client.user.update({
        where: { id: own.id },
        data: { role: 'OWNER' },
      });
    }
  });

  it('clears cookies on protected logout without a session and rejects anonymous replay', async () => {
    const browser = await bootstrap();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', browser.cookies)
      .set('X-CSRF-Token', browser.csrf)
      .expect(204);
    expect(response.headers['cache-control']).toBe('no-store');
    const cleared = cookieHeaders(response);
    expect(
      cleared.some((value) => value.startsWith('fielddesk_session=;')),
    ).toBe(true);
    expect(
      cleared.some((value) => value.startsWith('fielddesk_anonymous=;')),
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', browser.cookies)
      .set('X-CSRF-Token', browser.csrf)
      .expect(403);
  });
  it('revokes all sessions transactionally and prevents issuance crossing a version change', async () => {
    const browser = await login();
    const user = await client.user.findUnique({ where: { email: northOwner } });
    if (!user) {
      throw new Error('Missing test user');
    }
    await auth.revokeAllSessions(user.id);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', browser.cookies)
      .expect(401);
    const response = await loginAcrossCredentialChange(async () => {
      await second.get(AuthService).revokeAllSessions(user.id);
    });
    expect(response.status).toBe(401);
    // A new verification after revocation may legitimately create a new session.
    await login();
  });
  it('rejects issuance when the password hash changes after verification', async () => {
    const user = await client.user.findUniqueOrThrow({
      where: { email: northOwner },
    });
    const sessionsBefore = await client.session.count({
      where: { userId: user.id },
    });
    try {
      const response = await loginAcrossCredentialChange(async () => {
        // Test-only raw change proves hash rechecks even without a version increment.
        await client.user.update({
          where: { id: user.id },
          data: { passwordHash: 'changed-after-verification' },
        });
      });
      expect(response.status).toBe(401);
      expect(body(response).message).toBe('Invalid email or password');
      expect(cookies(response)).toEqual([]);
      expect(await client.session.count({ where: { userId: user.id } })).toBe(
        sessionsBefore,
      );
    } finally {
      await client.user.update({
        where: { id: user.id },
        data: { passwordHash: user.passwordHash },
      });
    }
  });
  it.each([true, false])(
    'serializes contending issuance and revocation (issuance first: %s)',
    async (issuanceFirst) => {
      const user = await client.user.findUniqueOrThrow({
        where: { email: northOwner },
      });
      const anonymous = await bootstrap();
      let release!: () => void;
      let acquired!: (pid: number) => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<number>((resolve) => {
        acquired = resolve;
      });
      const blocker = client.$transaction(
        async (transaction) => {
          const [{ pid }] = await transaction.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
          acquired(pid);
          await gate;
        },
        { timeout: 15000 },
      );
      const waitForQueue = async (
        pid: number,
        expected: number,
      ): Promise<void> => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const [{ count }] = await client.$queryRaw<{ count: number }[]>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> ${pid}
              AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'
          `;
          if (count === expected) {
            return;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(
          'Expected authentication transactions to wait on the user-row lock',
        );
      };
      const issue = (): Promise<TestResponse> =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Cookie', anonymous.cookies)
          .set('Origin', origin)
          .set('X-CSRF-Token', anonymous.csrf)
          .send({ email: northOwner, password })
          .then((response) => response);
      const revoke = (): Promise<void> =>
        second.get(AuthService).revokeAllSessions(user.id);
      let issuance: Promise<TestResponse> | undefined;
      let revocation: Promise<void> | undefined;
      try {
        const pid = await locked;
        if (issuanceFirst) {
          issuance = issue();
        } else {
          revocation = revoke();
        }
        await waitForQueue(pid, 1);
        if (issuanceFirst) {
          revocation = revoke();
        } else {
          issuance = issue();
        }
        await waitForQueue(pid, 2);
        release();
        await blocker;
        const [response] = await Promise.all([issuance, revocation]);
        if (!response) {
          throw new Error('Login did not execute');
        }
        expect(response.status).toBe(issuanceFirst ? 200 : 401);
        const current = await client.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        expect(current.authVersion).toBe(user.authVersion + 1);
        if (issuanceFirst) {
          const sessionCookies = cookies(response);
          const token = sessionCookies
            .find((value) => value.startsWith('fielddesk_session='))
            ?.split('=')[1];
          if (!token) {
            throw new Error('Missing issued session cookie');
          }
          sessionHashes.add(digest(token));
          const session = await client.session.findUniqueOrThrow({
            where: { tokenHash: digest(token) },
          });
          expect(session.authVersion).toBe(user.authVersion);
          expect(session.revokedAt).not.toBeNull();
          await request(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Cookie', sessionCookies)
            .expect(401);
        } else {
          expect(cookies(response)).toEqual([]);
          expect(body(response).message).toBe('Invalid email or password');
          expect(
            await client.session.count({
              where: { userId: user.id, revokedAt: null },
            }),
          ).toBe(0);
        }
      } finally {
        release();
        await Promise.allSettled([blocker, issuance, revocation]);
      }
    },
    20000,
  );

  it('allows concurrent logins already using anonymous state and rejects subsequent reuse', async () => {
    const anonymous = await bootstrap();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrivals = 0;
    const services = [app.get(RedisService), second.get(RedisService)];
    const spies = services.map((service) => {
      const remove = service.deleteAnonymous.bind(service);
      return jest
        .spyOn(service, 'deleteAnonymous')
        .mockImplementation(async (identifier) => {
          arrivals += 1;
          if (arrivals === 2) {
            release();
          }
          await gate;
          await remove(identifier);
        });
    });
    const timeout = setTimeout(release, 3000);
    try {
      const responses = await Promise.all(
        [app, second].map((application) =>
          request(application.getHttpServer())
            .post('/api/v1/auth/login')
            .set('Cookie', anonymous.cookies)
            .set('Origin', origin)
            .set('X-CSRF-Token', anonymous.csrf)
            .send({ email: northOwner, password })
            .expect(200),
        ),
      );
      expect(arrivals).toBe(2);
      const hashes: string[] = [];
      for (const response of responses) {
        const sessionCookies = cookies(response);
        const token = sessionCookies
          .find((value) => value.startsWith('fielddesk_session='))
          ?.split('=')[1];
        if (!token) {
          throw new Error('Missing issued session cookie');
        }
        hashes.push(digest(token));
        sessionHashes.add(digest(token));
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Cookie', sessionCookies)
          .expect(200);
      }
      expect(new Set(hashes).size).toBe(2);
      expect(
        await client.session.count({
          where: { tokenHash: { in: hashes }, revokedAt: null },
        }),
      ).toBe(2);
      expect(
        await redis.get(
          `${prefix}:csrf:${digest(anonymous.cookies[0].split('=')[1])}`,
        ),
      ).toBeNull();
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', anonymous.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', anonymous.csrf)
        .send({ email: northOwner, password })
        .expect(403);
    } finally {
      clearTimeout(timeout);
      release();
      spies.forEach((spy) => spy.mockRestore());
    }
  });
  it('shares atomic email limits across instances and reports the remaining window', async () => {
    const anonymous = await bootstrap();
    for (let index = 0; index < 6; index++) {
      const target = index % 2 ? second : app;
      const response = await request(target.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', anonymous.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', anonymous.csrf)
        .send({ email: northOwner, password: 'invalid' });
      expect(response.status).toBe(index < 5 ? 401 : 429);
      if (index === 5) {
        expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(
          890,
        );
      }
    }
    const key = `${prefix}:login:email:${digest(northOwner)}`;
    await redis.pexpire(key, 1100);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', anonymous.cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', anonymous.csrf)
      .send({ email: northOwner, password: 'invalid' })
      .expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(2);
    expect(await redis.pttl(key)).toBeGreaterThan(0);
  });
  it('shares the IP limit across instances even with different accounts', async () => {
    const anonymous = await bootstrap();
    for (let index = 0; index < 21; index++) {
      await request((index % 2 ? second : app).getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', anonymous.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', anonymous.csrf)
        .send({
          email: `unknown-${index}@fielddesk.example`,
          password: 'invalid',
        })
        .expect(index < 20 ? 401 : 429);
    }
    const keys = await scan(`${prefix}:login:*`);
    for (const key of keys) {
      expect(await redis.pttl(key)).toBeGreaterThan(0);
    }
  });
  it('fails closed on security dependencies and keeps health/docs public', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/health/ready').expect(200);
    const documentation = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const paths = body(documentation).paths as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/csrf',
        '/api/v1/auth/login',
        '/api/v1/auth/me',
        '/api/v1/auth/logout',
        '/api/v1/organisation',
        '/health/live',
        '/health/ready',
        '/',
      ]),
    );
    expect(paths['/api/v1/auth/me'].get).toMatchObject({
      security: [{ session: [] }],
    });
    const loginOperation = paths['/api/v1/auth/login'].post as Record<
      string,
      unknown
    >;
    expect(loginOperation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-CSRF-Token',
          in: 'header',
          required: true,
        }),
        expect.objectContaining({
          name: 'Origin',
          in: 'header',
          required: true,
        }),
      ]),
    );
    const browser = await bootstrap();
    const service = app.get(RedisService);
    await service.onModuleDestroy();
    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookies)
        .set('Origin', origin)
        .set('X-CSRF-Token', browser.csrf)
        .send({ email: northOwner, password })
        .expect(503);
      expect(response.headers['cache-control']).toBe('no-store');
      await request(app.getHttpServer()).get('/health/ready').expect(503);
      await request(app.getHttpServer())
        .get('/api/v1/auth/csrf')
        .set('Cookie', ['fielddesk_session=invalid'])
        .expect(503);
    } finally {
      await service.onModuleInit();
    }
  });
  it('allows only configured credentialed CORS origins and never logs credentials or internal tokens', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Origin', origin)
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const rejected = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect(
      logs.some(
        (value) =>
          value.includes('"requestId"') && value.includes('"durationMs"'),
      ),
    ).toBe(true);
    const serialized = logs.join('\n');
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain('secret_invalid_marker');
    expect(serialized).not.toContain('secret_body_marker');
    expect(serialized).not.toMatch(
      /passwordHash|tokenHash|authVersion|fielddesk_session|csrfToken/,
    );
  });

  it('releases owned PostgreSQL and Redis connections when application contexts close', async () => {
    const [{ pid }] = await app.get(PrismaService).client.$queryRaw<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid`;
    const connections = (await redis.client('LIST')) as string;
    expect(
      connections
        .split('\n')
        .filter((line) => line.includes(`name=${prefix}:security:`)),
    ).toHaveLength(2);
    await app.close();
    await second.close();
    const [{ active }] = await client.$queryRaw<
      { active: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ${pid}) AS active`;
    expect(active).toBe(false);
    const remaining = (await redis.client('LIST')) as string;
    expect(remaining).not.toContain(`name=${prefix}:security:`);
  });
});
