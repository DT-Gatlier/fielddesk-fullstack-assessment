import { z } from 'zod';

export const listWorkOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  technicianId: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'scheduled_start', 'priority', 'status']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListWorkOrdersQueryDTO = z.infer<typeof listWorkOrdersQuerySchema>;

export const createWorkOrderSchema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(255),
    description: z.string().max(2000).optional().nullable(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    siteName: z.string().min(2, 'Site name must be at least 2 characters').max(255),
    assignedTechnicianId: z.string().uuid().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    scheduledStart: z.string().datetime().optional().nullable(),
    scheduledEnd: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.scheduledStart && data.scheduledEnd) {
        return new Date(data.scheduledEnd) > new Date(data.scheduledStart);
      }
      return true;
    },
    {
      message: 'Scheduled end time must be after scheduled start time',
      path: ['scheduledEnd'],
    }
  );

export type CreateWorkOrderDTO = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = z
  .object({
    title: z.string().min(3).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
    siteName: z.string().min(2).max(255).optional(),
    assignedTechnicianId: z.string().uuid().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    scheduledStart: z.string().datetime().optional().nullable(),
    scheduledEnd: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.scheduledStart && data.scheduledEnd) {
        return new Date(data.scheduledEnd) > new Date(data.scheduledStart);
      }
      return true;
    },
    {
      message: 'Scheduled end time must be after scheduled start time',
      path: ['scheduledEnd'],
    }
  );

export type UpdateWorkOrderDTO = z.infer<typeof updateWorkOrderSchema>;

