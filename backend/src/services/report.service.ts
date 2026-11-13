import { Response } from 'express';
import { PoolClient } from 'pg';
import QueryStream from 'pg-query-stream';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
  getDbPool,
  isUsingMockDb,
  setUseMockDb,
  getMockWorkOrders,
  getMockUsers,
} from '../infrastructure/db.js';
import { TenantContext } from '../domain/models/tenant-context.js';
import { config } from '../infrastructure/config.js';
import { logger } from '../infrastructure/logger.js';

export interface ExportWorkOrdersFilters {
  status?: string;
  priority?: string;
  technicianId?: string;
  search?: string;
}

const CSV_HEADER =
  'Reference Number,Title,Priority,Status,Site Name,Assigned Technician,Scheduled Start,Scheduled End,Created At\n';

/**
 * Prevents Spreadsheet Formula Injection (CSV Injection) and applies RFC 4180 CSV escaping.
 */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Prefix leading formula trigger characters (=, +, -, @, \t, \r) with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Wrap in double quotes and double any inner quotes if special CSV delimiters exist
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

interface ExportWorkOrderRow {
  reference_number: string;
  title: string;
  priority: string;
  status: string;
  site_name: string;
  technician_name: string | null;
  scheduled_start: Date | string | null;
  scheduled_end: Date | string | null;
  created_at: Date | string;
}

function formatDateValue(val?: Date | string | null): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? String(val) : parsed.toISOString();
}

export function formatCsvRow(row: ExportWorkOrderRow): string {
  const fields = [
    row.reference_number,
    row.title,
    row.priority,
    row.status,
    row.site_name,
    row.technician_name || '',
    formatDateValue(row.scheduled_start),
    formatDateValue(row.scheduled_end),
    formatDateValue(row.created_at),
  ];

  return fields.map(sanitizeCsvField).join(',') + '\n';
}

function createCsvTransformStream(): Transform {
  let headerWritten = false;
  const csvStream = new Transform({
    writableObjectMode: true,
    transform(row: ExportWorkOrderRow, _encoding, callback) {
      try {
        if (!headerWritten) {
          csvStream.push(CSV_HEADER);
          headerWritten = true;
        }
        csvStream.push(formatCsvRow(row));
        callback();
      } catch (err: any) {
        callback(err);
      }
    },
    flush(callback) {
      if (!headerWritten) {
        csvStream.push(CSV_HEADER);
        headerWritten = true;
      }
      callback();
    },
  });
  return csvStream;
}

function createMockWorkOrdersStream(
  orgId: string,
  filters: ExportWorkOrdersFilters
): Readable {
  const users = getMockUsers();
  let items = getMockWorkOrders().filter((w) => w.organisation_id === orgId);

  if (filters.status && filters.status !== 'all') {
    items = items.filter((w) => w.status === filters.status);
  }
  if (filters.priority && filters.priority !== 'all') {
    items = items.filter((w) => w.priority === filters.priority);
  }
  if (filters.technicianId && filters.technicianId !== 'all') {
    items = items.filter((w) => w.assigned_technician_id === filters.technicianId);
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    items = items.filter(
      (w) =>
        w.reference_number.toLowerCase().includes(q) ||
        w.title.toLowerCase().includes(q) ||
        w.site_name.toLowerCase().includes(q)
    );
  }

  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const rows: ExportWorkOrderRow[] = items.map((w) => {
    const tech = users.find((u) => u.id === w.assigned_technician_id);
    return {
      reference_number: w.reference_number,
      title: w.title,
      priority: w.priority,
      status: w.status,
      site_name: w.site_name,
      technician_name: tech?.name || null,
      scheduled_start: w.scheduled_start,
      scheduled_end: w.scheduled_end,
      created_at: w.created_at,
    };
  });

  let index = 0;
  const readable = new Readable({
    objectMode: true,
    read() {
      if (index < rows.length) {
        readable.push(rows[index++]);
      } else {
        readable.push(null);
      }
    },
  });
  return readable;
}

export const reportService = {
  streamWorkOrdersCsv: async (
    ctx: TenantContext,
    filters: ExportWorkOrdersFilters,
    res: Response
  ): Promise<void> => {
    const conditions: string[] = ['wo.organisation_id = $1'];
    const params: any[] = [ctx.organisationId];
    let paramIdx = 2;

    if (filters.status && filters.status !== 'all') {
      conditions.push(`wo.status = $${paramIdx++}`);
      params.push(filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      conditions.push(`wo.priority = $${paramIdx++}`);
      params.push(filters.priority);
    }

    if (filters.technicianId && filters.technicianId !== 'all') {
      conditions.push(`wo.assigned_technician_id = $${paramIdx++}`);
      params.push(filters.technicianId);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        `(wo.reference_number ILIKE $${paramIdx} OR wo.title ILIKE $${paramIdx} OR wo.site_name ILIKE $${paramIdx})`
      );
      params.push(term);
      paramIdx++;
    }

    const sql = `
      SELECT
        wo.reference_number,
        wo.title,
        wo.priority,
        wo.status,
        wo.site_name,
        u_tech.name AS technician_name,
        wo.scheduled_start,
        wo.scheduled_end,
        wo.created_at
      FROM work_orders wo
      LEFT JOIN users u_tech ON wo.assigned_technician_id = u_tech.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY wo.created_at DESC
    `;

    let client: PoolClient | null = null;
    if (!isUsingMockDb()) {
      try {
        const pool = getDbPool();
        client = await pool.connect();
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' || config.NODE_ENV === 'test') {
          logger.warn('PostgreSQL unreachable or test mode, streaming CSV from mock DB');
          setUseMockDb(true);
        } else {
          throw err;
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="work-orders-export-${today}.csv"`
    );

    const csvTransform = createCsvTransformStream();

    if (client) {
      try {
        const queryStream = new QueryStream(sql, params, { batchSize: 100 });
        const dbStream = client.query(queryStream);
        await pipeline(dbStream, csvTransform, res);
      } finally {
        client.release();
      }
    } else {
      const mockStream = createMockWorkOrdersStream(ctx.organisationId, filters);
      await pipeline(mockStream, csvTransform, res);
    }
  },
};
