import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { stringify } from 'csv-stringify';
import type { Request, Response } from 'express';
import QueryStream from 'pg-query-stream';
import { pool } from '../../../../shared/db';
import { buildListQuery, type Scope } from '../work-orders/repository';
import type { ListQuery } from '../work-orders/schemas';

/**
 * Spreadsheet applications execute cells that start with these characters as
 * formulas (=HYPERLINK(...), +cmd|..., @SUM(...)). Prefixing a single quote
 * forces the cell to be treated as text. (OWASP "CSV Injection" guidance.)
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
export function neutraliseFormula(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return FORMULA_TRIGGER.test(s) ? `'${s}` : s;
}

const COLUMNS = [
  'reference', 'title', 'status', 'priority', 'site_name', 'technician', 'scheduled_start', 'scheduled_end',
  'created_by', 'created_at', 'updated_at', 'description',
] as const;

/**
 * Streams the filtered list as CSV. Rows are read from a server-side cursor
 * (pg-query-stream, 200 rows per fetch) and written as they arrive with
 * back-pressure, so memory use stays flat however many rows match. It uses the
 * SAME buildListQuery as the list endpoint: identical filters and scope,
 * including organisation isolation.
 */
export async function exportCsv(req: Request, res: Response, scope: Scope, q: ListQuery) {
  const { whereSql, orderBy, params } = buildListQuery(scope, q);
  const sql = `
    SELECT w.reference, w.title, w.status, w.priority, w.site_name, t.name AS technician,
           w.scheduled_start, w.scheduled_end, c.name AS created_by, w.created_at, w.updated_at, w.description
      FROM work_orders w
      LEFT JOIN users t ON t.id = w.technician_id
      LEFT JOIN users c ON c.id = w.created_by
     WHERE ${whereSql}
     ORDER BY ${orderBy}`;

  const client = await pool.connect();
  try {
    const rows = client.query(new QueryStream(sql, params, { batchSize: 200 }));
    const toRecord = new Transform({
      objectMode: true,
      transform(row: Record<string, unknown>, _enc, cb) {
        cb(null, COLUMNS.map((c) => neutraliseFormula(row[c])));
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="work-orders-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    // pipeline() tears the DB cursor down if the client disconnects mid-download.
    await pipeline(rows, toRecord, stringify({ header: true, columns: [...COLUMNS], quoted: true }), res);
    req.log.info({ export: 'work_orders' }, 'csv export finished');
    client.release();
  } catch (err) {
    // A connection whose cursor was interrupted is discarded, not returned to the pool.
    client.release(true);
    throw err;
  }
}
