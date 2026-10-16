import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { neutraliseFormula } from '../backend/src/modules/reports/csv';
import { createTestApp, createWorkOrder, loginAs, pool, resetData, type Agent, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;
let acme: Agent;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  acme = await loginAs(ctx.app, 'dispatcher@acme.test');
});
afterAll(() => ctx.close());

/** Minimal RFC 4180 parser for fully-quoted output. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('CSV export', () => {
  it('exports only the caller’s organisation', async () => {
    const res = await acme.get('/api/work-orders/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="work-orders-/);
    const rows = parseCsv(res.text);
    expect(rows[0]).toContain('reference');
    const data = rows.slice(1);
    expect(data).toHaveLength(seed.acme!.workOrders.length);
    expect(data.every((r) => r[1]!.startsWith('Acme'))).toBe(true);
    expect(res.text).not.toContain('Brightline');

    const bright = await loginAs(ctx.app, 'dispatcher@brightline.test');
    const bRes = await bright.get('/api/work-orders/export.csv');
    expect(bRes.text).not.toContain('Acme');
  });

  it('applies the same filters as the list endpoint', async () => {
    const query = 'status=open,on_hold&sort=reference&order=asc';
    const list = await acme.get(`/api/work-orders?${query}&pageSize=100`);
    const csv = parseCsv((await acme.get(`/api/work-orders/export.csv?${query}`)).text).slice(1);
    expect(csv.map((r) => r[0])).toEqual(list.body.data.map((w: { reference: string }) => w.reference));
    expect((await acme.get('/api/work-orders/export.csv?status=nonsense')).status).toBe(400);
  });

  it('neutralises spreadsheet formulas', async () => {
    await createWorkOrder(acme, { title: '=HYPERLINK("http://evil.test","click")', siteName: '+cmd|calc', description: '@SUM(A1:A9)' });
    const res = await acme.get('/api/work-orders/export.csv?q=evil');
    const row = parseCsv(res.text)[1]!;
    expect(row[1]).toBe(`'=HYPERLINK("http://evil.test","click")`);
    expect(row[4]).toBe(`'+cmd|calc`);
    expect(row[11]).toBe(`'@SUM(A1:A9)`);
    expect(neutraliseFormula('-2+3')).toBe(`'-2+3`);
    expect(neutraliseFormula('\tcmd')).toBe(`'\tcmd`);
    expect(neutraliseFormula('normal text')).toBe('normal text');
  });

  it('is restricted to roles that may export', async () => {
    const tech = await loginAs(ctx.app, 'tech1@acme.test');
    expect((await tech.get('/api/work-orders/export.csv')).status).toBe(403);
  });

  it('streams a large export (5,000 rows) correctly', async () => {
    await pool.query(
      `INSERT INTO work_orders (org_id, reference, title, priority, site_name, created_by)
       SELECT $1, 'BULK-' || g, 'Bulk ' || g, 'low', 'Bulk Site', $2 FROM generate_series(1, 5000) g`,
      [seed.acme!.id, seed.acme!.users.dispatcher!.id],
    );
    const res = await acme.get('/api/work-orders/export.csv?q=bulk');
    expect(res.status).toBe(200);
    expect(parseCsv(res.text).length - 1).toBe(5000);
  });
});
