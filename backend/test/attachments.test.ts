import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import { apiCreateWorkOrder, createOrg, createOwnerPool, createTestApp, futureWindow, login, type TestOrg } from './helpers.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (size = 1000) => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(size - PNG_SIGNATURE.length, 7)]);
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

function multipart(filename: string, content: Buffer, contentType = 'application/octet-stream') {
  const boundary = `----fielddesk${randomUUID()}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

let app: FastifyInstance;
let ownerPool: Pool;

beforeAll(async () => {
  app = await createTestApp({ env: { MAX_ATTACHMENT_BYTES: String(64 * 1024) } });
  ownerPool = createOwnerPool();
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

async function setup(storageLimitBytes = 10 * 1024 * 1024) {
  const org = await createOrg(ownerPool);
  await ownerPool.query('UPDATE organisations SET storage_limit_bytes = $2 WHERE id = $1', [org.id, storageLimitBytes]);
  const dispatcher = await login(app, org.dispatcher.email);
  const workOrder = await apiCreateWorkOrder(app, dispatcher, { assignedTechnicianId: org.technician.id, ...futureWindow() });
  return { org, dispatcher, workOrder };
}

const upload = (cookie: string, workOrderId: string, filename: string, content: Buffer, contentType?: string) => {
  const body = multipart(filename, content, contentType);
  return app.inject({
    method: 'POST',
    url: `/api/work-orders/${workOrderId}/attachments`,
    headers: { cookie, ...body.headers },
    payload: body.payload,
  });
};

async function usage(org: TestOrg): Promise<number> {
  const { rows } = await ownerPool.query('SELECT storage_used_bytes FROM organisations WHERE id = $1', [org.id]);
  return rows[0].storage_used_bytes;
}

async function storedFiles(org: TestOrg): Promise<string[]> {
  return readdir(path.join(app.config.UPLOAD_DIR, org.id)).catch(() => []);
}

describe('upload', () => {
  it('stores a valid image, tracks usage and audits it without exposing storage details', async () => {
    const { org, dispatcher, workOrder } = await setup();
    const response = await upload(dispatcher, workOrder.id, 'photo.png', png(1000), 'image/png');

    expect(response.statusCode).toBe(201);
    const attachment = response.json().data;
    expect(attachment).toMatchObject({ filename: 'photo.png', contentType: 'image/png', sizeBytes: 1000 });
    expect(response.body).not.toMatch(/storage|uploads|[A-Za-z]:\\|\/tmp\//i);

    expect(await usage(org)).toBe(1000);
    expect(await storedFiles(org)).toHaveLength(1);
    const audit = await ownerPool.query(`SELECT after FROM audit_log WHERE target_id = $1 AND action = 'attachment.added'`, [
      workOrder.id,
    ]);
    expect(audit.rows[0].after).toMatchObject({ attachmentId: attachment.id, sizeBytes: 1000 });
  });

  it('accepts PDFs and detects the type from content, not the declared type', async () => {
    const { dispatcher, workOrder } = await setup();
    const response = await upload(dispatcher, workOrder.id, 'report.pdf', pdf(), 'image/png');
    expect(response.statusCode).toBe(201);
    expect(response.json().data.contentType).toBe('application/pdf');
  });

  it('rejects files whose content is not an allowed type, whatever their name says', async () => {
    const { org, dispatcher, workOrder } = await setup();
    const executable = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]);
    const response = await upload(dispatcher, workOrder.id, 'innocent.png', executable, 'image/png');
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await usage(org)).toBe(0);
    expect(await storedFiles(org)).toHaveLength(0);
  });

  it('rejects files over the size limit', async () => {
    const { org, dispatcher, workOrder } = await setup();
    const response = await upload(dispatcher, workOrder.id, 'huge.png', png(65 * 1024), 'image/png');
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('FILE_TOO_LARGE');
    expect(await usage(org)).toBe(0);
    expect(await storedFiles(org)).toHaveLength(0);
  });

  it('ignores path components in the original filename', async () => {
    const { org, dispatcher, workOrder } = await setup();
    const response = await upload(dispatcher, workOrder.id, '../../../etc/passwd.png', png(), 'image/png');
    expect(response.statusCode).toBe(201);
    expect(response.json().data.filename).toBe('passwd.png');
    const files = await storedFiles(org);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('storage quota', () => {
  it('rejects an upload that would exceed the organisation limit', async () => {
    const { org, dispatcher, workOrder } = await setup(1500);
    expect((await upload(dispatcher, workOrder.id, 'a.png', png(1000))).statusCode).toBe(201);
    const over = await upload(dispatcher, workOrder.id, 'b.png', png(1000));
    expect(over.statusCode).toBe(413);
    expect(over.json().error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(await usage(org)).toBe(1000);
    expect(await storedFiles(org)).toHaveLength(1);
  });

  it('holds the limit under concurrent uploads', async () => {
    const { org, dispatcher, workOrder } = await setup(2500);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => upload(dispatcher, workOrder.id, `p${i}.png`, png(1000))),
    );
    expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(2);
    expect(responses.filter((r) => r.statusCode === 413)).toHaveLength(4);
    expect(await usage(org)).toBe(2000);
    expect(await storedFiles(org)).toHaveLength(2);
  });
});

describe('access control', () => {
  it('lets the organisation and the assigned technician download, and nobody else', async () => {
    const { org, dispatcher, workOrder } = await setup();
    const content = png(1234);
    const attachment = (await upload(dispatcher, workOrder.id, 'site.png', content)).json().data;
    const download = (cookie: string) => app.inject({ method: 'GET', url: attachment.downloadUrl, headers: { cookie } });

    const own = await download(dispatcher);
    expect(own.statusCode).toBe(200);
    expect(own.rawPayload.equals(content)).toBe(true);
    expect(own.headers).toMatchObject({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-disposition': expect.stringContaining('attachment;'),
    });

    expect((await download(await login(app, org.technician.email))).statusCode).toBe(200);

    const otherTechnician = await ownerPool.query<{ email: string }>(
      `INSERT INTO users (org_id, email, name, role, password_hash)
       SELECT org_id, $2, 'Other tech', 'technician', password_hash FROM users WHERE id = $1 RETURNING email`,
      [org.technician.id, `tech-${randomUUID()}@example.test`],
    );
    expect((await download(await login(app, otherTechnician.rows[0]!.email))).statusCode).toBe(404);

    const outsider = await createOrg(ownerPool);
    expect((await download(await login(app, outsider.owner.email))).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: attachment.downloadUrl })).statusCode).toBe(401);
  });

  it('does not let another organisation upload to a work order', async () => {
    const { workOrder } = await setup();
    const outsider = await createOrg(ownerPool);
    const response = await upload(await login(app, outsider.dispatcher.email), workOrder.id, 'x.png', png());
    expect(response.statusCode).toBe(404);
  });
});
