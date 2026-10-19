import { Readable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import Cursor from 'pg-cursor';
import type { AuthContext } from '../auth/sessions.js';
import type { Pool } from '../db/pool.js';
import type { WorkOrderRow } from './model.js';
import { buildWorkOrderQuery, type WorkOrderFilters } from './query.js';

const BATCH_SIZE = 500;

const COLUMNS: Array<[header: string, value: (row: WorkOrderRow) => string | null]> = [
  ['Reference', (row) => row.reference],
  ['Title', (row) => row.title],
  ['Status', (row) => row.status],
  ['Priority', (row) => row.priority],
  ['Site', (row) => row.site_name],
  ['Technician', (row) => row.technician_name],
  ['Scheduled start', (row) => row.scheduled_start?.toISOString() ?? null],
  ['Scheduled end', (row) => row.scheduled_end?.toISOString() ?? null],
  ['Created by', (row) => row.created_by_name],
  ['Created at', (row) => row.created_at.toISOString()],
  ['Updated at', (row) => row.updated_at.toISOString()],
  ['Description', (row) => row.description],
];

/**
 * Escapes one CSV cell. Spreadsheet applications execute cells that start with = + - @ (and tab or
 * carriage return, which some of them strip first) as formulas, so those values are prefixed with a
 * single quote to force them to be read as text (OWASP "CSV injection").
 */
export function csvCell(value: string | null): string {
  if (value === null) return '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

const csvLine = (values: Array<string | null>) => `${values.map(csvCell).join(',')}\r\n`;

/**
 * Streams the export from a server-side cursor in batches, so memory use stays flat regardless of
 * how many rows match. The cursor runs in a read-only transaction scoped to the caller's organisation
 * and uses the same filter builder (and therefore the same authorisation rules) as the list endpoint.
 */
export function streamWorkOrderCsv(
  pool: Pool,
  auth: AuthContext,
  filters: WorkOrderFilters,
  log: FastifyBaseLogger,
): Readable {
  const { where, orderBy, params } = buildWorkOrderQuery(auth, filters);

  async function* generate() {
    const client = await pool.connect();
    let rowCount = 0;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('app.org_id', $1, true)", [auth.orgId]);
      // UTF-8 BOM so spreadsheet applications detect the encoding.
      yield String.fromCharCode(0xfeff) + csvLine(COLUMNS.map(([header]) => header));

      const cursor = client.query(
        new Cursor<WorkOrderRow>(
          `SELECT wo.*, t.name AS technician_name, c.name AS created_by_name
           FROM work_orders wo
           LEFT JOIN users t ON t.id = wo.assigned_technician_id AND t.org_id = wo.org_id
           JOIN users c ON c.id = wo.created_by AND c.org_id = wo.org_id
           WHERE ${where} ORDER BY ${orderBy}`,
          params,
        ),
      );
      try {
        for (;;) {
          const rows = await cursor.read(BATCH_SIZE);
          if (rows.length === 0) break;
          rowCount += rows.length;
          yield rows.map((row) => csvLine(COLUMNS.map(([, value]) => value(row)))).join('');
        }
      } finally {
        await cursor.close();
      }
      await client.query('COMMIT');
      log.info({ rowCount }, 'csv export complete');
    } catch (error) {
      log.error({ err: error, rowCount }, 'csv export failed');
      throw error;
    } finally {
      // Runs on success, on error, and when the client disconnects mid-download. After COMMIT the
      // ROLLBACK is a harmless no-op; otherwise it ends the abandoned read-only transaction.
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  return Readable.from(generate());
}
