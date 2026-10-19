import { z } from 'zod';
import type { AuthContext } from '../auth/sessions.js';
import { PRIORITIES, STATUSES } from './model.js';

/** Accepts both ?status=open,scheduled and repeated ?status=open&status=scheduled. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap((entry) => String(entry).split(',')).filter(Boolean);
    }, z.array(item).max(10))
    .optional();

export const SORT_COLUMNS = {
  created_at: 'wo.created_at',
  updated_at: 'wo.updated_at',
  scheduled_start: 'wo.scheduled_start',
  priority: 'wo.priority',
  status: 'wo.status',
  reference: 'wo.reference',
  title: 'wo.title',
} as const;

export const filterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: list(z.enum(STATUSES)),
  priority: list(z.enum(PRIORITIES)),
  technicianId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  scheduledFrom: z.string().datetime({ offset: true }).optional(),
  scheduledTo: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(Object.keys(SORT_COLUMNS) as [keyof typeof SORT_COLUMNS, ...(keyof typeof SORT_COLUMNS)[]]).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const listQuerySchema = filterSchema
  .extend({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type WorkOrderFilters = z.infer<typeof filterSchema>;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Builds the WHERE and ORDER BY clauses shared by the list endpoint and the CSV export, so both
 * apply exactly the same authorisation rules. All values are bound parameters; only whitelisted
 * column names are interpolated.
 */
export function buildWorkOrderQuery(auth: AuthContext, filters: WorkOrderFilters) {
  const params: unknown[] = [auth.orgId];
  const conditions = ['wo.org_id = $1'];
  const add = (sql: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };

  // Technicians only ever see work assigned to them.
  if (auth.role === 'technician') add((p) => `wo.assigned_technician_id = ${p}`, auth.userId);

  if (filters.q) {
    add((p) => `(wo.reference || ' ' || wo.title || ' ' || wo.site_name) ILIKE ${p}`, `%${escapeLike(filters.q)}%`);
  }
  if (filters.status?.length) add((p) => `wo.status = ANY(${p}::work_order_status[])`, filters.status);
  if (filters.priority?.length) add((p) => `wo.priority = ANY(${p}::work_order_priority[])`, filters.priority);
  if (filters.technicianId === 'unassigned') conditions.push('wo.assigned_technician_id IS NULL');
  else if (filters.technicianId) add((p) => `wo.assigned_technician_id = ${p}`, filters.technicianId);
  if (filters.scheduledFrom) add((p) => `wo.scheduled_end > ${p}`, filters.scheduledFrom);
  if (filters.scheduledTo) add((p) => `wo.scheduled_start < ${p}`, filters.scheduledTo);

  const direction = filters.order === 'asc' ? 'ASC' : 'DESC';
  const orderBy = `${SORT_COLUMNS[filters.sort]} ${direction} NULLS LAST, wo.id ${direction}`;

  return { where: conditions.join(' AND '), orderBy, params };
}
