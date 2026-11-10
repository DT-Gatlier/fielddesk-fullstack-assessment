process.env.JWT_SECRET ||= require('node:crypto').randomBytes(32).toString('base64url');
require('tsx/cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { app } = require('../api/src/server.ts');
const { prisma } = require('../api/src/db.ts');

let server;
let origin;
let testEventId;
let testUserId;
let testCustomerId;
const referencePrefix = `TEST-${randomUUID().slice(0, 8)}`;

async function login(email, password = 'FieldDesk123!') {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { response, cookie };
}

async function api(path, cookie, options = {}) {
  return fetch(`${origin}/api${path}`, {
    ...options,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}

before(async () => {
  await prisma.$connect();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  const testJobs = await prisma.job.findMany({
    where: { referenceNumber: { startsWith: referencePrefix } },
    select: { id: true, organisationId: true },
  });
  const jobIds = testJobs.map((job) => job.id);
  const attachments = jobIds.length
    ? await prisma.attachment.findMany({ where: { jobId: { in: jobIds } }, select: { storageKey: true, sizeBytes: true } })
    : [];
  for (const attachment of attachments) {
    const filePath = path.resolve(process.cwd(), 'uploads', ...attachment.storageKey.split('/'));
    await fs.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  if (jobIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.notification.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.progressEvent.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.auditLog.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.job.deleteMany({ where: { id: { in: jobIds } } });
      const bytes = attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0n);
      if (bytes > 0n) {
        await tx.organisation.update({
          where: { id: testJobs[0].organisationId },
          data: { storageUsedBytes: { decrement: bytes } },
        });
      }
    });
  }
  if (testEventId) await prisma.progressEvent.deleteMany({ where: { idempotencyKey: testEventId } });
  if (testCustomerId) {
    await prisma.auditLog.deleteMany({ where: { targetType: 'customer', targetId: testCustomerId } });
    await prisma.customer.delete({ where: { id: testCustomerId } });
  }
  if (testUserId) {
    await prisma.auditLog.deleteMany({ where: { targetType: 'user', targetId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  }
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test('health, readiness, and authenticated sign-in work', async () => {
  const health = await api('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const readiness = await api('/ready');
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).database, 'connected');

  const unauthenticated = await api('/jobs');
  assert.equal(unauthenticated.status, 401);

  const failed = await login('raju@lakshmi.test', 'wrong-password');
  assert.equal(failed.response.status, 401);

  const signedIn = await login('raju@lakshmi.test');
  assert.equal(signedIn.response.status, 200);
  assert.ok(signedIn.cookie);
  assert.equal((await (await api('/auth/me', signedIn.cookie)).json()).user.role, 'DISPATCHER');
});

test('work-order access and CSV exports are isolated by organisation', async () => {
  const north = await login('raju@lakshmi.test');
  const south = await login('arun@srisai.test');
  const northJobs = await (await api('/jobs', north.cookie)).json();
  const northJob = northJobs.jobs[0];
  assert.ok(northJob);

  const crossTenant = await api(`/jobs/${northJob.id}`, south.cookie);
  assert.equal(crossTenant.status, 404);

  const csv = await (await api('/jobs.csv', south.cookie)).text();
  assert.match(csv, /FD-2001/);
  assert.doesNotMatch(csv, /FD-1001/);

  const technician = await login('kamal@lakshmi.test');
  const forbidden = await api('/jobs', technician.cookie, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(forbidden.status, 403);
});

test('owners can manage only users in their own organisation and role changes are audited', async () => {
  const owner = await login('aiswarya@lakshmi.test');
  const otherOwner = await login('priya@srisai.test');
  const email = `fielddesk-test-${randomUUID()}@lakshmi.test`;
  const created = await api('/users', owner.cookie, {
    method: 'POST',
    body: JSON.stringify({ email, name: 'Assessment Test User', password: 'TestPassword123!', role: 'TECHNICIAN' }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  testUserId = createdBody.user.id;

  const changed = await api(`/users/${testUserId}`, owner.cookie, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'DISPATCHER' }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).user.role, 'DISPATCHER');

  const crossTenant = await api(`/users/${testUserId}`, otherOwner.cookie, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'TECHNICIAN' }),
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(await prisma.auditLog.count({ where: { targetType: 'user', targetId: testUserId, action: 'user_role_changed' } }), 1);
});

test('customer creation enforces roles, validates input and isolates tenants', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  const technician = await login('kamal@lakshmi.test');
  const otherDispatcher = await login('arun@srisai.test');
  const body = { name: 'Meera', address: '12 Temple Road', phone: '9876543210' };
  assert.equal((await api('/customers', technician.cookie, { method: 'POST', body: JSON.stringify(body) })).status, 403);
  assert.equal((await api('/customers', dispatcher.cookie, { method: 'POST', body: JSON.stringify({ ...body, organisationId: 'foreign' }) })).status, 400);
  assert.equal((await api('/customers', dispatcher.cookie, { method: 'POST', body: JSON.stringify({ ...body, name: ' ' }) })).status, 400);
  const created = await api('/customers', dispatcher.cookie, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(created.status, 201);
  const { customer } = await created.json();
  testCustomerId = customer.id;
  const ownList = await (await api('/customers', dispatcher.cookie)).json();
  const otherList = await (await api('/customers', otherDispatcher.cookie)).json();
  assert.ok(ownList.customers.some(item => item.id === customer.id));
  assert.ok(!otherList.customers.some(item => item.id === customer.id));
  assert.equal(await prisma.auditLog.count({ where: { targetId: customer.id, action: 'customer_created' } }), 1);
});

test('overlapping technician schedules fail with a conflict response', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  const jobs = await (await api('/jobs', dispatcher.cookie)).json();
  const assigned = jobs.jobs.find((job) => job.technician && job.scheduledStart && job.scheduledEnd);
  assert.ok(assigned);

  const conflict = await api('/jobs', dispatcher.cookie, {
    method: 'POST',
    body: JSON.stringify({
      referenceNumber: `${referencePrefix}-API`,
      title: 'Conflict test',
      description: 'This overlap must be rejected.',
      customerId: assigned.customer.id,
      technicianId: assigned.technician.id,
      scheduledStart: assigned.scheduledStart,
      scheduledEnd: assigned.scheduledEnd,
    }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'SCHEDULE_CONFLICT');
});

test('concurrent database writes cannot reserve overlapping technician schedules', async () => {
  const organisation = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'sree-lakshmi-services' } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { organisationId: organisation.id } });
  const dispatcher = await prisma.user.findUniqueOrThrow({ where: { email: 'raju@lakshmi.test' } });
  const technician = await prisma.user.findUniqueOrThrow({ where: { email: 'kamal@lakshmi.test' } });
  const dayOffset = 300 + Math.floor(Math.random() * 100);
  const start = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const create = (suffix) => prisma.job.create({
    data: {
      organisationId: organisation.id,
      referenceNumber: `${referencePrefix}-${suffix}`,
      title: `Concurrent schedule ${suffix}`,
      description: 'Concurrency test.',
      customerId: customer.id,
      technicianId: technician.id,
      createdById: dispatcher.id,
      status: 'ASSIGNED',
      scheduledStart: start,
      scheduledEnd: end,
    },
  });

  const results = await Promise.allSettled([create('A'), create('B')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

test('server-sent work-order updates are delivered only to the same organisation', async () => {
  const north = await login('raju@lakshmi.test');
  const south = await login('arun@srisai.test');
  const northController = new AbortController();
  const southController = new AbortController();
  const northResponse = await fetch(`${origin}/api/events`, {
    headers: { cookie: north.cookie },
    signal: northController.signal,
  });
  const southResponse = await fetch(`${origin}/api/events`, {
    headers: { cookie: south.cookie },
    signal: southController.signal,
  });
  const northReader = northResponse.body.getReader();
  const southReader = southResponse.body.getReader();
  const decoder = new TextDecoder();
  const readUntil = async (reader, expected) => {
    let text = '';
    while (!text.includes(expected)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    return text;
  };
  await Promise.all([
    readUntil(northReader, 'event: connected'),
    readUntil(southReader, 'event: connected'),
  ]);
  try {
    const customer = await prisma.customer.findFirstOrThrow({
      where: { organisation: { slug: 'sree-lakshmi-services' } },
    });
    const created = await api('/jobs', north.cookie, {
      method: 'POST',
      body: JSON.stringify({
        referenceNumber: `${referencePrefix}-SSE`,
        title: 'SSE isolation test',
        description: 'Verify organisation-scoped events.',
        customerId: customer.id,
      }),
    });
    assert.equal(created.status, 201);
    const delivered = readUntil(northReader, 'event: job.created');
    const isolated = Promise.race([
      readUntil(southReader, 'event: job.created').then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 150)),
    ]);
    assert.match(await delivered, /event: job\.created/);
    assert.equal(await isolated, true);
  } finally {
    northController.abort();
    southController.abort();
    await Promise.all([northReader.cancel().catch(() => {}), southReader.cancel().catch(() => {})]);
  }
});

test('simultaneous duplicate progress events are applied once', async () => {
  const technician = await login('kamal@lakshmi.test');
  const jobs = await (await api('/jobs', technician.cookie)).json();
  const job = jobs.jobs.find((item) => item.referenceNumber === 'FD-1001');
  assert.ok(job);
  testEventId = `test-event-${randomUUID()}`;
  const body = JSON.stringify({
    eventId: testEventId,
    type: 'note_added',
    occurredAt: new Date().toISOString(),
    payload: { note: 'Automated idempotency verification.' },
  });
  const results = await Promise.all([
    api(`/jobs/${job.id}/events`, technician.cookie, { method: 'POST', body }),
    api(`/jobs/${job.id}/events`, technician.cookie, { method: 'POST', body }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal(await prisma.progressEvent.count({ where: { idempotencyKey: testEventId } }), 1);
  const changed = JSON.parse(body);
  changed.payload.note = 'Different request';
  assert.equal((await api(`/jobs/${job.id}/events`, technician.cookie, { method: 'POST', body: JSON.stringify(changed) })).status, 409);
});

test('logout invalidates a captured session cookie', async () => {
  const signedIn = await login('kamal@lakshmi.test');
  assert.equal((await api('/auth/logout', signedIn.cookie, { method: 'POST' })).status, 204);
  assert.equal((await api('/auth/me', signedIn.cookie)).status, 401);
});

test('simultaneous HTTP assignments return one success and one scheduling conflict', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  const original = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const start = new Date('2035-06-01T10:00:00Z');
  const body = { title: 'Concurrent API assignment', description: 'One reservation wins.', customerId: original.customerId, technicianId: original.technicianId, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 3600000).toISOString() };
  const responses = await Promise.all(['HTTP-A', 'HTTP-B'].map(suffix => api('/jobs', dispatcher.cookie, { method: 'POST', body: JSON.stringify({ ...body, referenceNumber: `${referencePrefix}-${suffix}` }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(await prisma.notification.count({ where: { job: { referenceNumber: { startsWith: `${referencePrefix}-HTTP` } } } }), 1);
});

test('filters, schedules and CSV share validation and escape spreadsheet formulas', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  const customer = await prisma.customer.findFirstOrThrow({ where: { organisation: { slug: 'sree-lakshmi-services' } } });
  const referenceNumber = `${referencePrefix}-CSV`;
  const created = await api('/jobs', dispatcher.cookie, { method: 'POST', body: JSON.stringify({ referenceNumber, title: '=1+1', description: 'CSV regression', customerId: customer.id, priority: 'URGENT' }) });
  assert.equal(created.status, 201);
  const query = `search=${referenceNumber}&priority=URGENT`;
  assert.equal((await (await api(`/jobs?${query}`, dispatcher.cookie)).json()).pagination.total, 1);
  assert.match(await (await api(`/jobs.csv?${query}`, dispatcher.cookie)).text(), /"'=1\+1"/);
  for (const endpoint of ['/jobs', '/jobs.csv']) {
    assert.equal((await api(`${endpoint}?priority=UNKNOWN`, dispatcher.cookie)).status, 400);
    assert.equal((await api(`${endpoint}?from=2030-02-02T00:00:00Z&to=2030-01-01T00:00:00Z`, dispatcher.cookie)).status, 400);
  }
});

test('history, activity and notifications enforce role and tenant scope', async () => {
  const north = await login('raju@lakshmi.test');
  const south = await login('arun@srisai.test');
  const technician = await login('kamal@lakshmi.test');
  const created = await prisma.job.findFirstOrThrow({ where: { referenceNumber: `${referencePrefix}-CSV` } });
  const historyResponse = await api(`/jobs/${created.id}/history`, north.cookie);
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.entries[0].afterData.title, '=1+1');
  assert.equal((await api(`/jobs/${created.id}/history`, south.cookie)).status, 404);
  assert.equal((await api(`/jobs/${created.id}/history`, technician.cookie)).status, 404);
  for (const endpoint of ['/activity', '/notifications']) {
    assert.equal((await api(endpoint, technician.cookie)).status, 403);
    const response = await api(endpoint, south.cookie);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), new RegExp(referencePrefix));
  }
});

test('cross-tenant assignment and client authority fields are rejected', async () => {
  const north = await login('raju@lakshmi.test');
  const original = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const foreign = await prisma.user.findUniqueOrThrow({ where: { email: 'suresh@srisai.test' } });
  const body = { referenceNumber: `${referencePrefix}-INVALID`, title: 'Invalid assignment', description: 'Rejected', customerId: original.customerId, technicianId: foreign.id, scheduledStart: '2036-01-01T10:00:00Z', scheduledEnd: '2036-01-01T11:00:00Z' };
  assert.equal((await api('/jobs', north.cookie, { method: 'POST', body: JSON.stringify(body) })).status, 400);
  assert.equal((await api('/jobs', north.cookie, { method: 'POST', body: JSON.stringify({ ...body, organisationId: foreign.organisationId, role: 'OWNER' }) })).status, 400);
  assert.equal(await prisma.job.count({ where: { referenceNumber: body.referenceNumber } }), 0);
  assert.equal((await api('/organisation', north.cookie)).status, 403);
});

test('technician filters cannot widen assigned-work scope in lists or exports', async () => {
  const signedIn = await login('kamal@lakshmi.test');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'kamal@lakshmi.test' } });
  const response = await api('/jobs?technicianId=someone-else', signedIn.cookie);
  assert.equal(response.status, 200);
  const { jobs } = await response.json();
  assert.ok(jobs.length);
  assert.ok(jobs.every(job => job.technicianId === user.id));
  const csv = await (await api('/jobs.csv?technicianId=someone-else', signedIn.cookie)).text();
  assert.match(csv, /FD-1001/);
  assert.doesNotMatch(csv, /FD-2001/);
  assert.equal((await api('/jobs?page=1.5', signedIn.cookie)).status, 400);
});

test('invalid work orders and failed progress updates leave no partial changes', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  assert.equal((await api('/jobs', dispatcher.cookie, { method: 'POST', body: '{}' })).status, 400);
  const technician = await login('kamal@lakshmi.test');
  const original = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const job = await prisma.job.create({ data: {
    organisationId: original.organisationId, createdById: original.createdById,
    customerId: original.customerId, technicianId: original.technicianId,
    scheduledStart: original.scheduledStart, scheduledEnd: original.scheduledEnd,
    referenceNumber: `${referencePrefix}-ROLLBACK`, title: 'Rollback test', description: 'Test', status: 'COMPLETED',
  } });
  const eventId = randomUUID();
  const response = await api(`/jobs/${job.id}/events`, technician.cookie, { method: 'POST', body: JSON.stringify({
    eventId, type: 'status_changed', occurredAt: new Date().toISOString(), payload: { status: 'IN_PROGRESS' },
  }) });
  assert.equal(response.status, 409);
  assert.equal(await prisma.progressEvent.count({ where: { idempotencyKey: eventId } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { jobId: job.id } }), 0);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, 'COMPLETED');
});

test('mock delivery retries and concurrent redelivery produce one durable receipt', async () => {
  const { processNotification } = require('../api/src/notification.ts');
  const job = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const item = await prisma.notification.create({ data: { organisationId: job.organisationId, jobId: job.id, recipient: 'test@example.test', channel: 'mock', status: 'PROCESSING' } });
  try {
    await assert.rejects(processNotification(item.id, 'temporary-once'), /temporarily/);
    await Promise.all([processNotification(item.id, 'success'), processNotification(item.id, 'success')]);
    const saved = await prisma.notification.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(saved.status, 'SENT');
    assert.equal(saved.attempts, 2);
    const receipts = await prisma.$queryRaw`SELECT * FROM "MockDelivery" WHERE "notificationId" = ${item.id}`;
    assert.equal(receipts.length, 1);
    assert.equal(await prisma.auditLog.count({ where: { targetId: item.id, action: 'notification_sent' } }), 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { targetId: item.id } });
    await prisma.notification.delete({ where: { id: item.id } });
  }
});

test('permanent notification failure stops future attempts', async () => {
  const { processNotification } = require('../api/src/notification.ts');
  const job = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const item = await prisma.notification.create({ data: { organisationId: job.organisationId, jobId: job.id, recipient: 'invalid', channel: 'mock', status: 'PROCESSING' } });
  try {
    await assert.rejects(processNotification(item.id, 'permanent'), /permanently/);
    await processNotification(item.id, 'success');
    const saved = await prisma.notification.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(saved.status, 'FAILED');
    assert.equal(saved.attempts, 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { targetId: item.id } });
    await prisma.notification.delete({ where: { id: item.id } });
  }
});

test('real Redis queue retries a temporary provider failure and records success', { timeout: 15000, skip: process.env.RUN_QUEUE_TESTS !== '1' }, async () => {
  const { Queue, Worker, QueueEvents } = require('bullmq');
  const Redis = require('ioredis');
  const { processNotification } = require('../api/src/notification.ts');
  const probe = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 0, retryStrategy: () => null });
  probe.on('error', () => {});
  try { await probe.connect(); await probe.ping(); } finally { probe.disconnect(); }
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const name = `test-${randomUUID()}`;
  const queue = new Queue(name, { connection });
  const events = new QueueEvents(name, { connection });
  const worker = new Worker(name, job => processNotification(job.data.id, 'temporary-once'), { connection });
  const job = await prisma.job.findFirstOrThrow({ where: { referenceNumber: 'FD-1001' } });
  const item = await prisma.notification.create({ data: { organisationId: job.organisationId, jobId: job.id, recipient: 'test@example.test', channel: 'mock', status: 'PROCESSING' } });
  try {
    await events.waitUntilReady();
    const queued = await queue.add('notify', { id: item.id }, { attempts: 4, backoff: { type: 'exponential', delay: 50 } });
    await queued.waitUntilFinished(events, 10000);
    const saved = await prisma.notification.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(saved.attempts, 2);
    assert.equal(saved.status, 'SENT');
  } finally {
    await worker.close(); await events.close(); await queue.obliterate({ force: true }); await queue.close(); await connection.quit();
    await prisma.auditLog.deleteMany({ where: { targetId: item.id } });
    await prisma.notification.delete({ where: { id: item.id } });
  }
});

test('attachments validate content, enforce quota, and stay in the owning organisation', async () => {
  const dispatcher = await login('raju@lakshmi.test');
  const otherOrg = await login('arun@srisai.test');
  const jobs = await (await api('/jobs', dispatcher.cookie)).json();
  const job = jobs.jobs.find((item) => item.referenceNumber === 'FD-1001');
  const pdfForm = new FormData();
  pdfForm.append('file', new Blob(['%PDF-1.4\nFieldDesk test\n%%EOF'], { type: 'application/pdf' }), 'field-report.pdf');
  const uploaded = await api(`/jobs/${job.id}/attachments`, dispatcher.cookie, { method: 'POST', body: pdfForm });
  assert.equal(uploaded.status, 201);
  const { attachment } = await uploaded.json();

  const otherOrgDownload = await api(`/attachments/${attachment.id}`, otherOrg.cookie);
  assert.equal(otherOrgDownload.status, 404);
  const ownDownload = await api(`/attachments/${attachment.id}`, dispatcher.cookie);
  assert.equal(ownDownload.status, 200);
  assert.match(ownDownload.headers.get('content-type'), /application\/pdf/);

  const badType = new FormData();
  badType.append('file', new Blob(['<html>not an image</html>'], { type: 'text/html' }), 'unsafe.html');
  const rejectedType = await api(`/jobs/${job.id}/attachments`, dispatcher.cookie, { method: 'POST', body: badType });
  assert.equal(rejectedType.status, 400);

  const largeFile = new FormData();
  largeFile.append('file', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  const rejectedSize = await api(`/jobs/${job.id}/attachments`, dispatcher.cookie, { method: 'POST', body: largeFile });
  assert.equal(rejectedSize.status, 413);

  const organisation = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'sree-lakshmi-services' } });
  const previousStorage = organisation.storageUsedBytes;
  try {
    await prisma.organisation.update({
      where: { id: organisation.id },
      data: { storageUsedBytes: BigInt(process.env.ORG_STORAGE_LIMIT_BYTES || 100 * 1024 * 1024) },
    });
    const quotaFile = new FormData();
    quotaFile.append('file', new Blob(['%PDF-1.4\nsmall'], { type: 'application/pdf' }), 'quota.pdf');
    const quotaResult = await api(`/jobs/${job.id}/attachments`, dispatcher.cookie, { method: 'POST', body: quotaFile });
    assert.equal(quotaResult.status, 413);
  } finally {
    await prisma.organisation.update({ where: { id: organisation.id }, data: { storageUsedBytes: previousStorage } });
  }

  const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
  await prisma.auditLog.deleteMany({ where: { targetType: 'attachment', targetId: attachment.id } });
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await prisma.organisation.update({
    where: { id: organisation.id },
    data: { storageUsedBytes: { decrement: stored.sizeBytes } },
  });
  await fs.unlink(path.resolve(process.cwd(), 'uploads', ...stored.storageKey.split('/')));
});
