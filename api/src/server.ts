import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import { JobPriority, JobStatus, Role, Prisma } from '@prisma/client';
import { prisma } from './db';

const PORT = Number(process.env.PORT || 4000);
const configuredJwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!configuredJwtSecret || Buffer.byteLength(configuredJwtSecret) < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
}
const JWT_SECRET = configuredJwtSecret && Buffer.byteLength(configuredJwtSecret) >= 32
  ? configuredJwtSecret
  : crypto.randomBytes(32).toString('base64url');
if (!configuredJwtSecret || Buffer.byteLength(configuredJwtSecret) < 32) {
  console.warn('JWT_SECRET is missing or too short; using an ephemeral development key. Set a strong value in .env.');
}

const SESSION_COOKIE = 'fielddesk_session';
const sessionMaxAge = 8 * 60 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  for (const [key, window] of loginAttempts) if (window.resetAt < Date.now()) loginAttempts.delete(key);
}, 60_000).unref();
const streams = new Map<string, Set<Response>>();
const dummyPasswordHash = bcrypt.hashSync('not-a-real-password', 10);
const maxUploadBytes = 5 * 1024 * 1024;
const organisationStorageLimit = Number(process.env.ORG_STORAGE_LIMIT_BYTES || 100 * 1024 * 1024);
if (!Number.isSafeInteger(organisationStorageLimit) || organisationStorageLimit < maxUploadBytes) {
  throw new Error('ORG_STORAGE_LIMIT_BYTES must be an integer of at least 5 MiB.');
}

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organisationId: string;
  organisationName: string;
};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      currentUser?: SessionUser;
    }
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function getPathId(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid record ID.', 'VALIDATION_ERROR');
  return value;
}

const app = express();
app.disable('x-powered-by');
app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      level: 'info',
      message: 'request',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.header('sec-fetch-site') === 'cross-site') {
    return next(new HttpError(403, 'Cross-site requests are not allowed.', 'FORBIDDEN'));
  }
  next();
});

function getCookie(req: Request, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function getToken(req: Request): string | undefined {
  const authorization = req.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return getCookie(req, SESSION_COOKIE);
}

const requireAuth: express.RequestHandler = async (req, _res, next) => {
  try {
    const token = getToken(req);
    if (!token) throw new HttpError(401, 'Sign in to continue.', 'UNAUTHENTICATED');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET!) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Your session has expired. Sign in again.', 'INVALID_SESSION');
    }
    if (typeof payload.sub !== 'string') {
      throw new HttpError(401, 'Your session is invalid.', 'INVALID_SESSION');
    }
    const sessions = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Session" WHERE id = ${payload.jti ?? ''} AND "userId" = ${payload.sub} AND "expiresAt" > NOW()`;
    if (!sessions.length) throw new HttpError(401, 'Your session has ended.', 'INVALID_SESSION');
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organisationId: true,
        organisation: { select: { name: true } },
      },
    });
    if (!user) throw new HttpError(401, 'Your account is unavailable.', 'INVALID_SESSION');
    req.currentUser = {
      ...user,
      organisationName: user.organisation.name,
    };
    next();
  } catch (error) {
    next(error);
  }
};

function allowRoles(...roles: Role[]): express.RequestHandler {
  return (req, _res, next) => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      next(new HttpError(403, 'You do not have permission to perform this action.', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

function eventRateLimit(req: Request, _res: Response, next: express.NextFunction) {
  const key = `${req.currentUser?.id ?? req.ip}:events`;
  const now = Date.now();
  const window = loginAttempts.get(key);
  if (!window || window.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  window.count += 1;
  if (window.count > 30) {
    next(new HttpError(429, 'Too many progress events. Try again shortly.', 'RATE_LIMITED'));
    return;
  }
  next();
}

function loginRateLimit(req: Request, _res: Response, next: express.NextFunction) {
  const key = `${req.ip}:login`;
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    next();
    return;
  }
  current.count += 1;
  if (current.count > 10) {
    next(new HttpError(429, 'Too many login attempts. Try again in 15 minutes.', 'RATE_LIMITED'));
    return;
  }
  next();
}

function publish(organisationId: string, type: string, data: unknown) {
  const clients = streams.get(organisationId);
  if (!clients) return;
  // Invalidation only: technicians must fetch records through assignment-scoped APIs.
  const message = `event: ${type}\ndata: {}\n\n`;
  for (const client of clients) client.write(message);
}

function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new HttpError(409, 'The record changed concurrently. Refresh and retry.', 'CONFLICT');
  }
  if (
    error instanceof Error &&
    error.message.includes('Job_technician_schedule_no_overlap')
  ) {
    throw new HttpError(409, 'The technician already has a work order during that time.', 'SCHEDULE_CONFLICT');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'A record with these details already exists.', 'CONFLICT');
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2003' || error.code === 'P2025')
  ) {
    throw new HttpError(400, 'A referenced record is invalid or no longer available.', 'INVALID_REFERENCE');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    throw new HttpError(409, 'This work order changed concurrently. Refresh and retry.', 'CONFLICT');
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23P01'
  ) {
    throw new HttpError(409, 'The technician already has a work order during that time.', 'SCHEDULE_CONFLICT');
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2004' &&
    JSON.stringify(error.meta).includes('Job_technician_schedule_no_overlap')
  ) {
    throw new HttpError(409, 'The technician already has a work order during that time.', 'SCHEDULE_CONFLICT');
  }
  throw error;
}

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/ready', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter a valid email and password.', 'VALIDATION_ERROR');
    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organisation: { select: { name: true } } },
    });
    const passwordMatches = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? dummyPasswordHash);
    if (!user || !user.isActive || !passwordMatches) {
      throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    loginAttempts.delete(`${req.ip}:login`);
    const sessionId = crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO "Session" (id, "userId", "expiresAt") VALUES (${sessionId}, ${user.id}, ${new Date(Date.now() + sessionMaxAge)})`;
    const token = jwt.sign({}, JWT_SECRET!, { subject: user.id, jwtid: sessionId, expiresIn: '8h' });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionMaxAge,
      path: '/',
    });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organisationName: user.organisation.name,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const payload = jwt.verify(getToken(req)!, JWT_SECRET) as jwt.JwtPayload;
  await prisma.$executeRaw`DELETE FROM "Session" WHERE id = ${payload.jti!}`;
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.currentUser });
});

app.get('/api/events', requireAuth, (req, res) => {
  const organisationId = req.currentUser!.organisationId;
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ requestId: req.requestId })}\n\n`);
  const clients = streams.get(organisationId) ?? new Set<Response>();
  clients.add(res);
  streams.set(organisationId, clients);
  const heartbeat = setInterval(async () => {
    try {
      const payload = jwt.verify(getToken(req)!, JWT_SECRET) as jwt.JwtPayload;
      const sessions = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Session" WHERE id = ${payload.jti!} AND "expiresAt" > NOW()`;
      const active = await prisma.user.findFirst({ where: { id: req.currentUser!.id, isActive: true, organisationId } });
      if (!sessions.length || !active) { res.end(); return; }
      res.write(': heartbeat\n\n');
    } catch { res.end(); }
  }, 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) streams.delete(organisationId);
  });
});

app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    const organisationId = req.currentUser!.organisationId;
    const baseWhere = req.currentUser!.role === Role.TECHNICIAN
      ? { organisationId, technicianId: req.currentUser!.id }
      : { organisationId };
    const [total, unassigned, inProgress, completed, recentJobs] = await Promise.all([
      prisma.job.count({ where: baseWhere }),
      prisma.job.count({ where: { ...baseWhere, status: JobStatus.UNASSIGNED } }),
      prisma.job.count({ where: { ...baseWhere, status: JobStatus.IN_PROGRESS } }),
      prisma.job.count({ where: { ...baseWhere, status: JobStatus.COMPLETED } }),
      prisma.job.findMany({
        where: baseWhere,
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          customer: { select: { name: true } },
          technician: { select: { name: true } },
        },
      }),
    ]);
    res.json({ counts: { total, unassigned, inProgress, completed }, recentJobs });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users', requireAuth, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        organisationId: req.currentUser!.organisationId,
        ...(req.currentUser!.role === Role.OWNER ? {} : { isActive: true }),
        ...(req.query.role === 'TECHNICIAN' ? { role: Role.TECHNICIAN } : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

app.get('/api/organisation', requireAuth, allowRoles(Role.OWNER), async (req, res) => {
  const organisation = await prisma.organisation.findUniqueOrThrow({ where: { id: req.currentUser!.organisationId }, select: { name: true, storageUsedBytes: true } });
  res.json({ organisation: { ...organisation, storageLimitBytes: organisationStorageLimit } });
});

app.patch('/api/organisation', requireAuth, allowRoles(Role.OWNER), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).strict().safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Enter an organisation name.', 'VALIDATION_ERROR');
  const organisation = await prisma.$transaction(async (tx) => {
    const previous = await tx.organisation.findUniqueOrThrow({ where: { id: req.currentUser!.organisationId } });
    const updated = await tx.organisation.update({ where: { id: previous.id }, data: parsed.data, select: { name: true } });
    await tx.auditLog.create({ data: { organisationId: previous.id, changedById: req.currentUser!.id, targetType: 'organisation', targetId: previous.id, action: 'organisation_updated', beforeData: { name: previous.name }, afterData: updated } });
    return updated;
  });
  res.json({ organisation });
});

app.get('/api/customers', requireAuth, async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { organisationId: req.currentUser!.organisationId },
      orderBy: { name: 'asc' },
    });
    res.json({ customers });
  } catch (error) {
    next(error);
  }
});

const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(254).optional(),
}).strict();

app.post('/api/customers', requireAuth, allowRoles(Role.OWNER, Role.DISPATCHER), async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Enter a customer name, address, phone and valid optional email.', 'VALIDATION_ERROR');
  const user = req.currentUser!;
  const customer = await prisma.$transaction(async tx => {
    const created = await tx.customer.create({ data: { ...parsed.data, organisationId: user.organisationId } });
    await tx.auditLog.create({ data: {
      organisationId: user.organisationId,
      changedById: user.id,
      targetType: 'customer',
      targetId: created.id,
      action: 'customer_created',
      afterData: parsed.data,
    } });
    return created;
  });
  res.status(201).json({ customer });
});

const createUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  role: z.enum([Role.DISPATCHER, Role.TECHNICIAN]),
}).strict();

app.post('/api/users', requireAuth, allowRoles(Role.OWNER), async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter a valid name, email, password and role.', 'VALIDATION_ERROR');
    const data = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.trim().toLowerCase(),
          name: data.name,
          passwordHash: await bcrypt.hash(data.password, 12),
          role: data.role,
          organisationId: req.currentUser!.organisationId,
        },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          organisationId: req.currentUser!.organisationId,
          changedById: req.currentUser!.id,
          action: 'user_created',
          targetType: 'user',
          targetId: user.id,
          afterData: { email: user.email, role: user.role },
        },
      });
      return user;
    });
    publish(req.currentUser!.organisationId, 'user.updated', { user: created });
    res.status(201).json({ user: created });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum([Role.DISPATCHER, Role.TECHNICIAN]).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.');

app.patch('/api/users/:id', requireAuth, allowRoles(Role.OWNER), async (req, res, next) => {
  try {
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Provide a valid name, role or active status.', 'VALIDATION_ERROR');
    const id = getPathId(req, 'id');
    if (id === req.currentUser!.id && parsed.data.isActive === false) {
      throw new HttpError(400, 'You cannot deactivate your own account.', 'VALIDATION_ERROR');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const previous = await tx.user.findFirst({
        where: { id, organisationId: req.currentUser!.organisationId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      if (!previous) throw new HttpError(404, 'User not found.', 'NOT_FOUND');
      if (previous.role === Role.OWNER && (parsed.data.role || parsed.data.isActive === false)) {
        throw new HttpError(400, 'Owner accounts cannot be demoted or deactivated.', 'VALIDATION_ERROR');
      }
      const user = await tx.user.update({
        where: { id },
        data: parsed.data,
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      await tx.auditLog.create({
        data: {
          organisationId: req.currentUser!.organisationId,
          changedById: req.currentUser!.id,
          action: parsed.data.role && parsed.data.role !== previous.role ? 'user_role_changed' : 'user_updated',
          targetType: 'user',
          targetId: user.id,
          beforeData: { name: previous.name, role: previous.role, isActive: previous.isActive },
          afterData: { name: user.name, role: user.role, isActive: user.isActive },
        },
      });
      return user;
    });
    publish(req.currentUser!.organisationId, 'user.updated', { user: updated });
    res.json({ user: updated });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

const statuses = Object.values(JobStatus) as [JobStatus, ...JobStatus[]];
const priorities = Object.values(JobPriority) as [JobPriority, ...JobPriority[]];
const jobFieldsSchema = z.object({
  referenceNumber: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  customerId: z.string().min(1).max(100).optional(),
  technicianId: z.string().min(1).max(100).nullable().optional(),
  siteName: z.string().trim().max(200).nullable().optional(),
  priority: z.enum(priorities).optional(),
  status: z.enum(statuses).optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
}).strict();

const jobInclude = {
  customer: { select: { id: true, name: true, address: true, phone: true, email: true } },
  technician: { select: { id: true, name: true, email: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.JobInclude;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(200).optional(),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  technicianId: z.string().min(1).max(100).optional(),
  sort: z.enum(['updatedAt', 'scheduledStart', 'createdAt', 'referenceNumber', 'title']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();

function workOrderQuery(req: Request) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Invalid search, filter or pagination parameters.', 'VALIDATION_ERROR');
  const query = parsed.data;
  if (query.from && query.to && query.from >= query.to) throw new HttpError(400, 'Filter end must follow start.', 'VALIDATION_ERROR');
  const user = req.currentUser!;
  const where: Prisma.JobWhereInput = {
    organisationId: user.organisationId,
    ...(user.role === Role.TECHNICIAN ? { technicianId: user.id } : query.technicianId ? { technicianId: query.technicianId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.from ? { scheduledEnd: { gt: new Date(query.from) } } : {}),
    ...(query.to ? { scheduledStart: { lt: new Date(query.to) } } : {}),
    ...(query.search ? { OR: [
      { title: { contains: query.search, mode: 'insensitive' } },
      { referenceNumber: { contains: query.search, mode: 'insensitive' } },
      { siteName: { contains: query.search, mode: 'insensitive' } },
      { customer: { name: { contains: query.search, mode: 'insensitive' } } },
    ] } : {}),
  };
  return { query, where };
}

app.get('/api/activity', requireAuth, allowRoles(Role.OWNER, Role.DISPATCHER), async (req, res) => {
  const { query } = workOrderQuery(req);
  const where = { organisationId: req.currentUser!.organisationId };
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: query.pageSize, skip: (query.page - 1) * query.pageSize, include: { changedBy: { select: { name: true } }, job: { select: { referenceNumber: true, title: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ entries, pagination: { page: query.page, pages: Math.ceil(total / query.pageSize), total } });
});

app.get('/api/notifications', requireAuth, allowRoles(Role.OWNER, Role.DISPATCHER), async (req, res) => {
  const { query } = workOrderQuery(req);
  const where = { organisationId: req.currentUser!.organisationId };
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.pageSize, skip: (query.page - 1) * query.pageSize, select: { id: true, status: true, attempts: true, recipient: true, lastError: true, createdAt: true, sentAt: true, job: { select: { referenceNumber: true, title: true } } } }),
    prisma.notification.count({ where }),
  ]);
  res.json({ notifications, pagination: { page: query.page, pages: Math.ceil(total / query.pageSize), total } });
});

app.get('/api/jobs', requireAuth, async (req, res, next) => {
  try {
    const { query, where } = workOrderQuery(req);
    const { page, pageSize, sort: sortField, direction } = query;
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: jobInclude,
        orderBy: [{ [sortField]: direction }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.job.count({ where }),
    ]);
    res.json({ jobs, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
});

const writableRoles = [Role.OWNER, Role.DISPATCHER] as const;
const saveJob = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
  isCreate: boolean,
) => {
  try {
    const parsed = jobFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid work-order details.', 'VALIDATION_ERROR');
    }
    const data = parsed.data;
    if (isCreate && (!data.referenceNumber || !data.title || !data.description || !data.customerId)) {
      throw new HttpError(400, 'Reference, title, description and customer are required.', 'VALIDATION_ERROR');
    }
    const organisationId = req.currentUser!.organisationId;
    const current = isCreate
      ? null
      : await prisma.job.findFirst({ where: { id: getPathId(req, 'id'), organisationId } });
    if (!isCreate && !current) throw new HttpError(404, 'Work order not found.', 'NOT_FOUND');

    const customerId = data.customerId ?? current?.customerId;
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, organisationId } });
      if (!customer) throw new HttpError(400, 'Choose a customer in your organisation.', 'INVALID_REFERENCE');
    }
    const technicianId = data.technicianId === undefined ? current?.technicianId : data.technicianId;
    if (technicianId) {
      const technician = await prisma.user.findFirst({
        where: { id: technicianId, organisationId, role: Role.TECHNICIAN, isActive: true },
      });
      if (!technician) throw new HttpError(400, 'Choose an active technician in your organisation.', 'INVALID_REFERENCE');
    }

    const startText = data.scheduledStart === undefined ? current?.scheduledStart?.toISOString() ?? null : data.scheduledStart;
    const endText = data.scheduledEnd === undefined ? current?.scheduledEnd?.toISOString() ?? null : data.scheduledEnd;
    if ((startText && !endText) || (!startText && endText)) {
      throw new HttpError(400, 'Provide both scheduled start and end times.', 'VALIDATION_ERROR');
    }
    if (startText && endText && new Date(startText).getTime() >= new Date(endText).getTime()) {
      throw new HttpError(400, 'Scheduled end must be after scheduled start.', 'VALIDATION_ERROR');
    }
    if (technicianId && !startText) {
      throw new HttpError(400, 'A technician assignment requires a schedule.', 'VALIDATION_ERROR');
    }

    const nextStatus = data.status ?? (
      isCreate
        ? technicianId ? JobStatus.ASSIGNED : JobStatus.UNASSIGNED
        : technicianId
          ? current!.status === JobStatus.UNASSIGNED ? JobStatus.ASSIGNED : current!.status
          : current!.status === JobStatus.ASSIGNED ? JobStatus.UNASSIGNED : current!.status
    );
    if ((nextStatus === JobStatus.ASSIGNED || nextStatus === JobStatus.IN_PROGRESS) && !technicianId) {
      throw new HttpError(400, 'Assign a technician before setting this status.', 'VALIDATION_ERROR');
    }
    const saved = await prisma.$transaction(async (tx) => {
      const job = isCreate
        ? await tx.job.create({
            data: {
              organisationId,
              createdById: req.currentUser!.id,
              referenceNumber: data.referenceNumber!,
              title: data.title!,
              description: data.description!,
              customerId: customerId!,
              technicianId,
              siteName: data.siteName ?? null,
              priority: data.priority ?? JobPriority.NORMAL,
              status: nextStatus,
              scheduledStart: startText ? new Date(startText) : null,
              scheduledEnd: endText ? new Date(endText) : null,
            },
            include: jobInclude,
          })
        : await tx.job.update({
            where: { id: current!.id, updatedAt: current!.updatedAt },
            data: {
              ...(data.referenceNumber !== undefined ? { referenceNumber: data.referenceNumber } : {}),
              ...(data.title !== undefined ? { title: data.title } : {}),
              ...(data.description !== undefined ? { description: data.description } : {}),
              ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
              ...(data.technicianId !== undefined ? { technicianId: data.technicianId } : {}),
              ...(data.siteName !== undefined ? { siteName: data.siteName } : {}),
              ...(data.priority !== undefined ? { priority: data.priority } : {}),
              status: nextStatus,
              ...(data.scheduledStart !== undefined ? { scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : null } : {}),
              ...(data.scheduledEnd !== undefined ? { scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null } : {}),
            },
            include: jobInclude,
          });
      const changed = !current || current.technicianId !== job.technicianId;
      await tx.auditLog.create({
        data: {
          organisationId,
          jobId: job.id,
          changedById: req.currentUser!.id,
          targetId: job.id,
          action: isCreate ? 'work_order_created' : current!.technicianId !== job.technicianId ? 'assignment_changed' : current!.status !== job.status ? 'status_changed' : 'work_order_updated',
          fromStatus: current?.status ?? null,
          toStatus: job.status,
          beforeData: current ? JSON.parse(JSON.stringify(current)) : Prisma.JsonNull,
          afterData: JSON.parse(JSON.stringify({ ...job, customer: undefined, technician: undefined, createdBy: undefined })),
        },
      });
      let notificationId: string | null = null;
      if (job.technicianId && (!current || changed)) {
        const notification = await tx.notification.create({
          data: {
            organisationId,
            jobId: job.id,
            recipient: job.technician?.email ?? '',
            channel: 'mock',
          },
        });
        notificationId = notification.id;
      }
      return { job, notificationId };
    });
    publish(organisationId, isCreate ? 'job.created' : 'job.updated', saved.job);
    // The independent worker drains the committed notification outbox.
    res.status(isCreate ? 201 : 200).json({ job: saved.job });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
};

app.post('/api/jobs', requireAuth, allowRoles(...writableRoles), (req, res, next) => saveJob(req, res, next, true));
app.put('/api/jobs/:id', requireAuth, allowRoles(...writableRoles), (req, res, next) => saveJob(req, res, next, false));

app.get('/api/jobs/:id/history', requireAuth, async (req, res) => {
  const user = req.currentUser!;
  const id = getPathId(req, 'id');
  const job = await prisma.job.findFirst({ where: { id, organisationId: user.organisationId, ...(user.role === Role.TECHNICIAN ? { technicianId: user.id } : {}) }, select: { id: true } });
  if (!job) throw new HttpError(404, 'Work order not found.', 'NOT_FOUND');
  const { query } = workOrderQuery(req);
  const entries = await prisma.$queryRaw`
    SELECT * FROM (
      SELECT a.id, a.action, a.timestamp, a."beforeData", a."afterData", u.name AS actor, NULL::text AS message
      FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."changedById"
      WHERE a."jobId" = ${id} AND a."organisationId" = ${user.organisationId}
      UNION ALL
      SELECT e.id, e."eventType" AS action, e."createdAt" AS timestamp, NULL::jsonb AS "beforeData", e.metadata AS "afterData", u.name AS actor, e.message
      FROM "ProgressEvent" e LEFT JOIN "User" u ON u.id = e."userId"
      WHERE e."jobId" = ${id} AND e."organisationId" = ${user.organisationId}
    ) history ORDER BY timestamp DESC, id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
  const [audits, events] = await Promise.all([
    prisma.auditLog.count({ where: { jobId: id, organisationId: user.organisationId } }),
    prisma.progressEvent.count({ where: { jobId: id, organisationId: user.organisationId } }),
  ]);
  res.json({ entries, pagination: { page: query.page, total: audits + events, pages: Math.ceil((audits + events) / query.pageSize) } });
});

app.get('/api/jobs/:id', requireAuth, async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        id: getPathId(req, 'id'),
        organisationId: req.currentUser!.organisationId,
        ...(req.currentUser!.role === Role.TECHNICIAN ? { technicianId: req.currentUser!.id } : {}),
      },
      include: {
        ...jobInclude,
        notifications: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true } },
        auditLogs: { orderBy: { timestamp: 'desc' }, take: 30, include: { changedBy: { select: { name: true } } } },
        progressEvents: { orderBy: { createdAt: 'desc' }, take: 30, include: { user: { select: { name: true } } } },
        attachments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { name: true } } },
        },
      },
    });
    if (!job) throw new HttpError(404, 'Work order not found.', 'NOT_FOUND');
    res.json({ job });
  } catch (error) {
    next(error);
  }
});

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new HttpError(400, 'Upload a PDF, JPEG, PNG, GIF or WebP file.', 'INVALID_FILE_TYPE'));
      return;
    }
    callback(null, true);
  },
});

function detectMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

app.post('/api/jobs/:id/attachments', requireAuth, upload.single('file'), async (req, res, next) => {
  const file = req.file;
  let storedPath: string | undefined;
  try {
    if (!file) throw new HttpError(400, 'Choose a file to upload.', 'VALIDATION_ERROR');
    const user = req.currentUser!;
    const job = await prisma.job.findFirst({
      where: {
        id: getPathId(req, 'id'),
        organisationId: user.organisationId,
        ...(user.role === Role.TECHNICIAN ? { technicianId: user.id } : {}),
      },
      select: { id: true },
    });
    if (!job) throw new HttpError(404, 'Work order not found.', 'NOT_FOUND');
    const actualMimeType = detectMimeType(file.buffer);
    if (!actualMimeType || actualMimeType !== file.mimetype) {
      throw new HttpError(400, 'The file contents do not match an allowed file type.', 'INVALID_FILE_TYPE');
    }
    const extensionByMime: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const safeName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'attachment';
    const storageKey = `${user.organisationId}/${crypto.randomUUID()}.${extensionByMime[actualMimeType]}`;
    storedPath = path.resolve(process.cwd(), 'uploads', ...storageKey.split('/'));
    await fs.mkdir(path.dirname(storedPath), { recursive: true });
    await fs.writeFile(storedPath, file.buffer, { flag: 'wx' });

    const attachment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${job.id} FOR UPDATE`;
      const stillAuthorized = await tx.job.findFirst({ where: { id: job.id, organisationId: user.organisationId, ...(user.role === Role.TECHNICIAN ? { technicianId: user.id } : {}) } });
      if (!stillAuthorized) throw new HttpError(404, 'Work order not found.', 'NOT_FOUND');
      const reservation = await tx.organisation.updateMany({
        where: {
          id: user.organisationId,
          storageUsedBytes: { lte: BigInt(organisationStorageLimit - file.size) },
        },
        data: { storageUsedBytes: { increment: BigInt(file.size) } },
      });
      if (reservation.count !== 1) {
        throw new HttpError(413, 'Your organisation storage limit has been reached.', 'STORAGE_QUOTA_EXCEEDED');
      }
      const record = await tx.attachment.create({
        data: {
          organisationId: user.organisationId,
          jobId: job.id,
          uploadedById: user.id,
          fileName: safeName,
          mimeType: actualMimeType,
          sizeBytes: BigInt(file.size),
          storageKey,
        },
      });
      await tx.auditLog.create({
        data: {
          organisationId: user.organisationId,
          jobId: job.id,
          targetType: 'attachment',
          targetId: record.id,
          changedById: user.id,
          action: 'attachment_added',
          afterData: { fileName: safeName, mimeType: actualMimeType, sizeBytes: file.size },
        },
      });
      return record;
    });
    publish(user.organisationId, 'job.updated', { jobId: job.id });
    res.status(201).json({
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
        createdAt: attachment.createdAt,
      },
    });
  } catch (error) {
    if (storedPath) await fs.unlink(storedPath).catch((cleanupError) => {
      console.error(JSON.stringify({
        level: 'error',
        message: 'attachment_cleanup_failed',
        requestId: req.requestId,
        error: cleanupError instanceof Error ? cleanupError.message : 'unknown error',
      }));
    });
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

app.get('/api/attachments/:id', requireAuth, async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: getPathId(req, 'id'), organisationId: req.currentUser!.organisationId },
      include: { job: { select: { technicianId: true } } },
    });
    if (
      !attachment ||
      (req.currentUser!.role === Role.TECHNICIAN && attachment.job.technicianId !== req.currentUser!.id)
    ) {
      throw new HttpError(404, 'Attachment not found.', 'NOT_FOUND');
    }
    const storagePath = path.resolve(process.cwd(), 'uploads', ...attachment.storageKey.split('/'));
    res.download(storagePath, attachment.fileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

const progressSchema = z.object({
  eventId: z.string().min(1).max(100),
  workOrderId: z.string().min(1).max(100).optional(),
  type: z.enum(['status_changed', 'note_added']),
  occurredAt: z.string().datetime(),
  payload: z.object({
    status: z.preprocess(value => typeof value === 'string' ? value.toUpperCase() : value, z.enum([JobStatus.IN_PROGRESS, JobStatus.COMPLETED])).optional(),
    note: z.string().max(2000).optional(),
  }).strict(),
}).strict();

app.post('/api/jobs/:id/events', requireAuth, eventRateLimit, async (req, res, next) => {
  try {
    if (req.currentUser!.role !== Role.TECHNICIAN) {
      throw new HttpError(403, 'Only assigned technicians can submit progress events.', 'FORBIDDEN');
    }
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'The progress event is invalid.', 'VALIDATION_ERROR');
    const event = parsed.data;
    if (event.workOrderId && event.workOrderId !== getPathId(req, 'id')) throw new HttpError(400, 'Work order IDs do not match.', 'VALIDATION_ERROR');
    if (event.type === 'status_changed' && !event.payload.status) {
      throw new HttpError(400, 'A status is required for a status change.', 'VALIDATION_ERROR');
    }
    if (new Date(event.occurredAt).getTime() > Date.now() + 300_000) throw new HttpError(400, 'Event timestamp is in the future.', 'VALIDATION_ERROR');
    if (event.type === 'note_added' && event.payload.status) throw new HttpError(400, 'Note events cannot include status.', 'VALIDATION_ERROR');
    if (event.type === 'note_added' && !event.payload.note?.trim()) {
      throw new HttpError(400, 'A note is required for a note event.', 'VALIDATION_ERROR');
    }
    const where = {
      id: getPathId(req, 'id'),
      organisationId: req.currentUser!.organisationId,
      technicianId: req.currentUser!.id,
    };
    const job = await prisma.job.findFirst({ where });
    if (!job) throw new HttpError(404, 'Assigned work order not found.', 'NOT_FOUND');
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${job.id} FOR UPDATE`;
        const locked = await tx.job.findFirst({ where });
        if (!locked) throw new HttpError(404, 'Assigned work order not found.', 'NOT_FOUND');
        const created = await tx.progressEvent.create({
          data: {
            organisationId: req.currentUser!.organisationId,
            jobId: job.id,
            userId: req.currentUser!.id,
            eventType: event.type,
            message: event.payload.note ?? null,
            metadata: {
              eventId: event.eventId,
              occurredAt: event.occurredAt,
              original: req.body,
              ...(event.payload.status ? { status: event.payload.status } : {}),
            },
            idempotencyKey: event.eventId,
          },
        });
        if (event.type === 'status_changed' && event.payload.status) {
          await tx.job.update({ where: { id: job.id }, data: { status: event.payload.status } });
          await tx.auditLog.create({
            data: {
              organisationId: req.currentUser!.organisationId,
              jobId: job.id,
              changedById: req.currentUser!.id,
              action: 'technician_status_changed',
              fromStatus: locked.status,
              toStatus: event.payload.status,
              beforeData: { status: locked.status },
              afterData: { status: event.payload.status, eventId: event.eventId },
            },
          });
        }
        return created;
      });
      publish(req.currentUser!.organisationId, 'job.progress', { jobId: job.id, event: result });
      res.status(201).json({ event: result });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await prisma.progressEvent.findFirst({
          where: { jobId: job.id, idempotencyKey: event.eventId, userId: req.currentUser!.id },
        });
        if (duplicate) {
          const original = (duplicate.metadata as any)?.original;
          if (original && !isDeepStrictEqual(original, req.body)) throw new HttpError(409, 'Event ID already used with different content.', 'IDEMPOTENCY_CONFLICT');
          res.status(200).json({ event: duplicate, duplicate: true });
          return;
        }
      }
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs.csv', requireAuth, async (req, res, next) => {
  try {
    const { where } = workOrderQuery(req);
    const csvCell = (value: string | null | undefined) => {
      const safe = (value ?? '').replace(/^[\s]*[=+\-@]/, (prefix) => `'${prefix}`);
      return `"${safe.replaceAll('"', '""')}"`;
    };
    res.type('text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fielddesk-work-orders.csv"');
    res.write('Reference,Title,Status,Priority,Customer,Technician,Scheduled start,Scheduled end\n');
    let cursor: string | undefined;
    while (true) {
      const batch = await prisma.job.findMany({
        where,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 500,
        include: { customer: { select: { name: true } }, technician: { select: { name: true } } },
      });
      if (batch.length === 0) break;
      for (const job of batch) {
        if (res.destroyed) return;
        const writable = res.write([
          job.referenceNumber,
          job.title,
          job.status,
          job.priority,
          job.customer.name,
          job.technician?.name ?? '',
          job.scheduledStart?.toISOString() ?? '',
          job.scheduledEnd?.toISOString() ?? '',
        ].map(csvCell).join(',') + '\n');
        if (!writable && !res.destroyed) await new Promise<void>(resolve => {
          const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
          res.once('drain', done); res.once('close', done);
        });
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < 500) break;
    }
    res.end();
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.resolve(process.cwd(), 'web/dist')));

app.use((req, _res, next) => next(new HttpError(404, 'The requested API route does not exist.', 'NOT_FOUND')));

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) { res.end(); return; }
  if (error?.type === 'entity.parse.failed') error = new HttpError(400, 'Invalid JSON.', 'VALIDATION_ERROR');
  const isMulterError = error instanceof multer.MulterError;
  const status = error instanceof HttpError
    ? error.status
    : isMulterError
      ? error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      : 500;
  const message = error instanceof HttpError
    ? error.message
    : isMulterError
      ? error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 5 MiB or smaller.' : 'Upload one file at a time.'
      : 'An unexpected server error occurred.';
  const code = error instanceof HttpError
    ? error.code
    : isMulterError
      ? error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD'
      : 'INTERNAL_ERROR';
  if (status >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'request_failed',
      requestId: req.requestId,
      error: error instanceof Error ? error.message : 'unknown error',
    }));
  }
  res.status(status).json({ error: { code, message, requestId: req.requestId } });
};
app.use(errorHandler);

export { app };

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ level: 'info', message: 'api_listening', port: PORT }));
  });
  const shutdown = async () => {
    for (const clients of streams.values()) for (const client of clients) client.end();
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
