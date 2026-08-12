import type { RequestHandler } from 'express';
import QueryStream from 'pg-query-stream';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import type { Database } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';

const querySchema = z.object({
  search: z.string().trim().max(200).optional(), status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
});

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportWorkOrders(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity); const query = querySchema.parse(request.query);
    const params: unknown[] = [identity.organisationId]; const where = ['w.organisation_id = $1'];
    if (identity.role === 'technician') { params.push(identity.userId); where.push(`w.assigned_technician_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`w.status = $${params.length}`); }
    if (query.priority) { params.push(query.priority); where.push(`w.priority = $${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); where.push(`(w.reference_number ILIKE $${params.length} OR w.title ILIKE $${params.length} OR w.site_name ILIKE $${params.length})`); }
    const client = await database.connect();
    let released = false;
    const release = () => { if (!released) { released = true; client.release(); } };
    const stream = client.query(new QueryStream(`SELECT w.reference_number, w.title, w.description, w.priority, w.status, u.name AS technician, w.scheduled_start, w.scheduled_end, w.site_name, w.created_at, w.updated_at FROM work_orders w LEFT JOIN users u ON u.organisation_id = w.organisation_id AND u.id = w.assigned_technician_id WHERE ${where.join(' AND ')} ORDER BY w.created_at DESC`, params, { batchSize: 250 }));
    response.type('text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="work-orders.csv"');
    response.write('\uFEFFReference,Title,Description,Priority,Status,Technician,Scheduled Start,Scheduled End,Site,Created,Updated\r\n');
    stream.on('data', (row: Record<string, unknown>) => {
      const values = ['reference_number', 'title', 'description', 'priority', 'status', 'technician', 'scheduled_start', 'scheduled_end', 'site_name', 'created_at', 'updated_at'].map((key) => csvCell(row[key]));
      if (!response.write(`${values.join(',')}\r\n`)) stream.pause();
    });
    response.on('drain', () => stream.resume());
    stream.on('end', () => { release(); response.end(); });
    stream.on('error', (error: Error) => { release(); response.destroy(error); });
    response.on('close', () => { if (!stream.destroyed) stream.destroy(); release(); });
  });
}
