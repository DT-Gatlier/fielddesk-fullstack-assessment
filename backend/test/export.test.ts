import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import { csvCell } from '../src/work-orders/export.js';
import { apiCreateWorkOrder, createOrg, createOwnerPool, createTestApp, futureWindow, login } from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

const exportCsv = (cookie: string, query = '') =>
  app.inject({ method: 'GET', url: `/api/work-orders/export.csv${query}`, headers: { cookie } });

describe('csvCell', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+44 20 7946 0000', "'+44 20 7946 0000"],
    ['-5', "'-5"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=cmd', "'\t=cmd"],
    ['=HYPERLINK("http://evil.example")', `"'=HYPERLINK(""http://evil.example"")"`],
    ['plain, with comma', '"plain, with comma"'],
    ['line\nbreak', '"line\nbreak"'],
    [null, ''],
  ])('escapes %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe('export endpoint', () => {
  it('exports only the caller organisation’s work orders', async () => {
    const orgA = await createOrg(ownerPool);
    const orgB = await createOrg(ownerPool);
    const cookieA = await login(app, orgA.dispatcher.email);
    const cookieB = await login(app, orgB.dispatcher.email);
    await apiCreateWorkOrder(app, cookieA, { title: 'Alpha org job' });
    await apiCreateWorkOrder(app, cookieB, { title: 'Bravo org job' });

    const response = await exportCsv(cookieA);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="work-orders-/);

    expect(response.body.charCodeAt(0)).toBe(0xfeff);
    const lines = response.body.slice(1).trim().split('\r\n');
    expect(lines[0]).toMatch(/^Reference,Title,Status/);
    expect(lines).toHaveLength(2);
    expect(response.body).toContain('Alpha org job');
    expect(response.body).not.toContain('Bravo org job');
  });

  it('applies the same filters and technician scope as the list endpoint', async () => {
    const org = await createOrg(ownerPool);
    const dispatcher = await login(app, org.dispatcher.email);
    const technician = await login(app, org.technician.email);
    await apiCreateWorkOrder(app, dispatcher, { title: 'Assigned job', assignedTechnicianId: org.technician.id, ...futureWindow() });
    await apiCreateWorkOrder(app, dispatcher, { title: 'Unassigned job' });

    const filtered = await exportCsv(dispatcher, '?status=open');
    expect(filtered.body).toContain('Unassigned job');
    expect(filtered.body).not.toContain('Assigned job');

    const technicianExport = await exportCsv(technician);
    expect(technicianExport.body).toContain('Assigned job');
    expect(technicianExport.body).not.toContain('Unassigned job');
  });

  it('neutralises spreadsheet formulas in exported data', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    await apiCreateWorkOrder(app, cookie, { title: '=HYPERLINK("http://evil.example","Click")', siteName: '@SUM(1+1)' });

    const body = (await exportCsv(cookie)).body;
    expect(body).toContain(`"'=HYPERLINK(""http://evil.example"",""Click"")"`);
    expect(body).toContain("'@SUM(1+1)");
    expect(body).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('requires authentication and validates filters', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/work-orders/export.csv' })).statusCode).toBe(401);
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    expect((await exportCsv(cookie, '?status=bogus')).statusCode).toBe(400);
  });

  it('streams large exports', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    await ownerPool.query(
      `INSERT INTO work_orders (org_id, reference, title, site_name, created_by)
       SELECT $1, 'BULK-' || g, 'Bulk job ' || g, 'Site', $2 FROM generate_series(1, 1200) AS g`,
      [org.id, org.dispatcher.id],
    );
    const response = await exportCsv(cookie);
    expect(response.statusCode).toBe(200);
    // Header plus 1200 rows, delivered across several cursor batches.
    expect(response.body.trim().split('\r\n')).toHaveLength(1201);
  });
});
