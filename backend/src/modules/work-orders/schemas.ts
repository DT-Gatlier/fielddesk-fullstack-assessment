import { z } from 'zod';
import { isoDateTime } from '../../middleware/validate';
import { PRIORITIES, STATUSES } from './status';

const MAX_WINDOW_MS = 14 * 24 * 3600_000;

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvEnum(STATUSES).optional(),
  priority: csvEnum(PRIORITIES).optional(),
  technicianId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  // Work orders whose scheduled window overlaps [scheduledFrom, scheduledTo)
  scheduledFrom: isoDateTime.optional(),
  scheduledTo: isoDateTime.optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'scheduledStart', 'priority', 'reference', 'title', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Shared rules for a scheduling window, applied wherever one is set. */
function checkSchedule(
  v: { technicianId?: string | null; scheduledStart?: Date | null; scheduledEnd?: Date | null },
  ctx: z.RefinementCtx,
) {
  const hasStart = v.scheduledStart != null;
  const hasEnd = v.scheduledEnd != null;
  if (hasStart !== hasEnd) {
    ctx.addIssue({ code: 'custom', path: [hasStart ? 'scheduledEnd' : 'scheduledStart'], message: 'scheduledStart and scheduledEnd must be provided together' });
    return;
  }
  if (hasStart && hasEnd) {
    const ms = v.scheduledEnd!.getTime() - v.scheduledStart!.getTime();
    if (ms <= 0) ctx.addIssue({ code: 'custom', path: ['scheduledEnd'], message: 'scheduledEnd must be after scheduledStart' });
    else if (ms > MAX_WINDOW_MS) ctx.addIssue({ code: 'custom', path: ['scheduledEnd'], message: 'a scheduling window cannot exceed 14 days' });
  }
  if (v.technicianId && !hasStart) {
    ctx.addIssue({ code: 'custom', path: ['scheduledStart'], message: 'a schedule is required when assigning a technician' });
  }
}

const baseFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  priority: z.enum(PRIORITIES),
  siteName: z.string().trim().min(1).max(200),
};

export const createSchema = z
  .object({
    ...baseFields,
    technicianId: z.string().uuid().nullable().optional(),
    scheduledStart: isoDateTime.nullable().optional(),
    scheduledEnd: isoDateTime.nullable().optional(),
  })
  .strict() // rejects orgId, createdBy, status, reference etc. supplied by the client
  .superRefine(checkSchedule);

export const updateSchema = z
  .object({
    title: baseFields.title.optional(),
    description: z.string().trim().max(5000).optional(),
    priority: baseFields.priority.optional(),
    siteName: baseFields.siteName.optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'at least one field to update is required');

export const assignmentSchema = z
  .object({
    technicianId: z.string().uuid().nullable(),
    scheduledStart: isoDateTime.nullable(),
    scheduledEnd: isoDateTime.nullable(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine(checkSchedule);

export const statusSchema = z
  .object({
    status: z.enum(STATUSES),
    note: z.string().trim().max(1000).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
