import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { config } from '../shared/config';
import { createTestApp, loginAs, pool, resetData, type Agent, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;
let dispatcher: Agent;
let woId: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 2)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 3)]);

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
  woId = seed.acme!.workOrders[0]!.id; // assigned to tech1
});
afterAll(() => ctx.close());

const usage = async (orgId: string) =>
  (await pool.query('SELECT storage_used_bytes FROM organisations WHERE id = $1', [orgId])).rows[0].storage_used_bytes as number;
const upload = (agent: Agent, id: string, buf: Buffer, filename: string, contentType = 'application/octet-stream') =>
  agent.post(`/api/work-orders/${id}/attachments`).attach('file', buf, { filename, contentType });

describe('attachments', () => {
  it('uploads a PNG, tracks storage usage and never exposes storage details', async () => {
    const res = await upload(dispatcher, woId, PNG, 'photo.png', 'image/png');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ filename: 'photo.png', contentType: 'image/png', sizeBytes: PNG.length });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/storage|objects|\.test-storage|\/tmp/i);
    expect(Object.keys(res.body.data)).not.toContain('storageKey');
    expect(await usage(seed.acme!.id)).toBe(PNG.length);
    // The work order detail lists it, the audit log records it.
    const detail = await dispatcher.get(`/api/work-orders/${woId}`);
    expect(detail.body.data.attachments).toHaveLength(1);
    const audit = await pool.query("SELECT after FROM audit_log WHERE action = 'attachment.added' AND work_order_id = $1", [woId]);
    expect(audit.rows[0].after).toMatchObject({ filename: 'photo.png', sizeBytes: PNG.length });
  });

  it('detects type from file content, not from the filename or declared MIME type', async () => {
    const disguised = await upload(dispatcher, woId, EXE, 'invoice.pdf', 'application/pdf');
    expect(disguised.status).toBe(415);
    expect(disguised.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const realPdf = await upload(dispatcher, woId, PDF, 'scan.bin', 'text/plain');
    expect(realPdf.status).toBe(201);
    expect(realPdf.body.data.contentType).toBe('application/pdf');
    expect(await usage(seed.acme!.id)).toBe(PDF.length);
  });

  it('rejects files over the size limit and leaves no temp files behind', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(config.MAX_UPLOAD_BYTES)]);
    const res = await upload(dispatcher, woId, big, 'huge.png', 'image/png');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await usage(seed.acme!.id)).toBe(0);
    expect(await readdir(join(config.STORAGE_DIR, 'tmp'))).toEqual([]);
  });

  it('enforces the organisation storage quota, including under concurrent uploads', async () => {
    await pool.query('UPDATE organisations SET storage_limit_bytes = $2 WHERE id = $1', [seed.acme!.id, PNG.length * 3]);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => upload(dispatcher, woId, PNG, `p${i}.png`, 'image/png')),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 413)).toHaveLength(3);
    const rejected = results.find((r) => r.status === 413)!;
    expect(rejected.body.error).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED', details: { limitBytes: PNG.length * 3 } });
    expect(await usage(seed.acme!.id)).toBe(PNG.length * 3);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM attachments WHERE org_id = $1', [seed.acme!.id]);
    expect(rows[0].n).toBe(3);
    // Usage is tracked per organisation.
    expect(await usage(seed.brightline!.id)).toBe(0);
  });

  it('stores files under generated identifiers, never the client filename', async () => {
    const res = await upload(dispatcher, woId, PNG, '../../../etc/passwd.png', 'image/png');
    expect(res.status).toBe(201);
    expect(res.body.data.filename).toBe('passwd.png');
    const { rows } = await pool.query('SELECT storage_key FROM attachments WHERE id = $1', [res.body.data.id]);
    expect(rows[0].storage_key).toMatch(new RegExp(`^${seed.acme!.id}/[0-9a-f-]{36}$`));
  });

  it('downloads with safe headers for authorised users', async () => {
    const up = await upload(dispatcher, woId, PDF, 'report "final".pdf', 'application/pdf');
    const res = await dispatcher.get(up.body.data.downloadUrl).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('blocks attachment access across organisations and for unassigned technicians', async () => {
    const up = await upload(dispatcher, woId, PNG, 'a.png', 'image/png');
    const url = up.body.data.downloadUrl;
    const foreign = await loginAs(ctx.app, 'dispatcher@brightline.test');
    expect((await foreign.get(url)).status).toBe(404);
    expect((await upload(foreign, woId, PNG, 'x.png', 'image/png')).status).toBe(404);

    const assignedTech = await loginAs(ctx.app, 'tech1@acme.test');
    expect((await assignedTech.get(url)).status).toBe(200);
    expect((await upload(assignedTech, woId, PNG, 'site-photo.png', 'image/png')).status).toBe(201);

    const otherTech = await loginAs(ctx.app, 'tech2@acme.test');
    expect((await otherTech.get(url)).status).toBe(404);
    expect((await upload(otherTech, woId, PNG, 'x.png', 'image/png')).status).toBe(404);
    expect((await request(ctx.app).get(url)).status).toBe(401);
  });
});
