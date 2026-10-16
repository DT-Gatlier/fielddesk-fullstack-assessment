import type { Db } from '../../../../shared/db';
import type { AuthContext } from '../../types';
import type { ListQuery } from './schemas';
import type { Priority, Status } from './status';

/**
 * Tenant + role scope for every work-order query. It is built only from the
 * authenticated identity: organisation always, and technicians are further
 * restricted to work orders currently assigned to them.
 */
export interface Scope {
  orgId: string;
  technicianId: string | null;
}
export const scopeOf = (auth: AuthContext): Scope => ({
  orgId: auth.orgId,
  technicianId: auth.role === 'technician' ? auth.userId : null,
});

export interface WorkOrderRow {
  id: string;
  org_id: string;
  reference: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  site_name: string;
  technician_id: string | null;
  technician_name?: string | null;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  assignment_version: number;
  version: number;
  created_by: string;
  created_by_name?: string | null;
  created_at: Date;
  updated_at: Date;
}

export function toWorkOrder(r: WorkOrderRow) {
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    siteName: r.site_name,
    technician: r.technician_id ? { id: r.technician_id, name: r.technician_name ?? null } : null,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    version: r.version,
    createdBy: { id: r.created_by, name: r.created_by_name ?? null },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type WorkOrderDto = ReturnType<typeof toWorkOrder>;

export const SELECT_WITH_NAMES = `
  SELECT w.*, t.name AS technician_name, c.name AS created_by_name
    FROM work_orders w
    LEFT JOIN users t ON t.id = w.technician_id
    LEFT JOIN users c ON c.id = w.created_by`;

/** Fetch one work order inside the caller's scope. Returns undefined for "not yours" and "does not exist" alike. */
export async function findInScope(db: Db, scope: Scope, id: string): Promise<WorkOrderRow | undefined> {
  const { rows } = await db.query<WorkOrderRow>(
    `${SELECT_WITH_NAMES} WHERE w.id = $1 AND w.org_id = $2 AND ($3::uuid IS NULL OR w.technician_id = $3)`,
    [id, scope.orgId, scope.technicianId],
  );
  return rows[0];
}

/** Same as findInScope but takes a row lock for the rest of the transaction. */
export async function lockInScope(db: Db, scope: Scope, id: string): Promise<WorkOrderRow | undefined> {
  const { rows } = await db.query<WorkOrderRow>(
    `SELECT * FROM work_orders WHERE id = $1 AND org_id = $2 AND ($3::uuid IS NULL OR technician_id = $3) FOR UPDATE`,
    [id, scope.orgId, scope.technicianId],
  );
  return rows[0];
}

const SORT_SQL: Record<ListQuery['sort'], string> = {
  createdAt: 'w.created_at',
  updatedAt: 'w.updated_at',
  scheduledStart: 'w.scheduled_start',
  priority: "array_position(ARRAY['low','medium','high','urgent'], w.priority)",
  reference: 'w.reference',
  title: 'lower(w.title)',
  status: "array_position(ARRAY['open','in_progress','on_hold','completed','cancelled'], w.status)",
};

/**
 * Builds the WHERE / ORDER BY clauses for the list endpoint. The CSV export
 * uses the exact same function, so both always apply identical filters and
 * authorisation scope. Every value is passed as a bind parameter; sort columns
 * come from a fixed allow-list.
 */
export function buildListQuery(scope: Scope, q: Omit<ListQuery, 'page' | 'pageSize'>) {
  const params: unknown[] = [scope.orgId];
  const where = ['w.org_id = $1'];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };

  if (scope.technicianId) add((p) => `w.technician_id = ${p}`, scope.technicianId);
  if (q.q) {
    const escaped = q.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    add((p) => `w.search_text LIKE ${p}`, `%${escaped}%`);
  }
  if (q.status?.length) add((p) => `w.status = ANY(${p}::text[])`, q.status);
  if (q.priority?.length) add((p) => `w.priority = ANY(${p}::text[])`, q.priority);
  if (q.technicianId === 'unassigned') where.push('w.technician_id IS NULL');
  else if (q.technicianId) add((p) => `w.technician_id = ${p}`, q.technicianId);
  if (q.scheduledFrom) add((p) => `w.scheduled_end > ${p}`, q.scheduledFrom);
  if (q.scheduledTo) add((p) => `w.scheduled_start < ${p}`, q.scheduledTo);

  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const nulls = q.sort === 'scheduledStart' ? ' NULLS LAST' : '';
  const orderBy = `${SORT_SQL[q.sort]} ${dir}${nulls}, w.id ${dir}`;
  return { whereSql: where.join(' AND '), orderBy, params };
}
