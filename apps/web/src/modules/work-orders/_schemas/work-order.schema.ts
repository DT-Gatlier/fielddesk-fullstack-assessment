import { z } from 'zod';

const GRACE_PERIOD_MS = 5 * 60 * 1000;

export const createWorkOrderSchema = z
  .object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(100),
    description: z.string().trim().min(2, 'Description must be at least 2 characters').max(1000),
    siteName: z.string().trim().min(2, 'Site name must be at least 2 characters').max(100),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assignedTechnicianId: z.string().uuid().optional().or(z.literal('')),
    scheduledStart: z.string().optional().or(z.literal('')),
    scheduledEnd: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.scheduledStart && !data.scheduledEnd) return false;
      if (!data.scheduledStart && data.scheduledEnd) return false;
      return true;
    },
    {
      message: 'Both start and end time must be provided',
      path: ['scheduledEnd'],
    },
  )
  .refine(
    (data) => {
      if (data.scheduledStart && data.scheduledEnd) {
        return new Date(data.scheduledStart) < new Date(data.scheduledEnd);
      }
      return true;
    },
    {
      message: 'Start time must precede end time',
      path: ['scheduledEnd'],
    },
  )
  .refine(
    (data) => {
      if (data.scheduledStart) {
        return new Date(data.scheduledStart).getTime() >= Date.now() - GRACE_PERIOD_MS;
      }
      return true;
    },
    {
      message: 'Scheduled start time cannot be in the past',
      path: ['scheduledStart'],
    },
  );

export type CreateWorkOrderFormValues = z.infer<typeof createWorkOrderSchema>;

export const assignTechnicianSchema = z
  .object({
    assignedTechnicianId: z.string().uuid('Please select a technician'),
    scheduledStart: z.string().min(1, 'Scheduled start time is required'),
    scheduledEnd: z.string().min(1, 'Scheduled end time is required'),
  })
  .refine(
    (data) => new Date(data.scheduledStart).getTime() >= Date.now() - GRACE_PERIOD_MS,
    {
      message: 'Scheduled start time cannot be in the past',
      path: ['scheduledStart'],
    },
  )
  .refine(
    (data) => new Date(data.scheduledStart) < new Date(data.scheduledEnd),
    {
      message: 'Start time must precede end time',
      path: ['scheduledEnd'],
    },
  );

export type AssignTechnicianFormValues = z.infer<typeof assignTechnicianSchema>;

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(100),
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(1000),
  siteName: z.string().trim().min(2, 'Site name must be at least 2 characters').max(100),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
});

export type UpdateWorkOrderFormValues = z.infer<typeof updateWorkOrderSchema>;
