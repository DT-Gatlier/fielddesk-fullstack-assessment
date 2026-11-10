import { z } from 'zod';

export const progressEventSchema = z.object({
  eventId: z
    .string()
    .min(1, 'eventId must not be empty')
    .max(128, 'eventId cannot exceed 128 characters'),
  workOrderId: z.string().uuid('workOrderId must be a valid UUID'),
  type: z.enum(['status_changed', 'note_added', 'work_paused']),
  occurredAt: z
    .string()
    .datetime('occurredAt must be a valid ISO-8601 timestamp')
    .refine((val) => {
      // Allow slight clock skew of up to 60 seconds
      return new Date(val).getTime() <= Date.now() + 60000;
    }, 'occurredAt cannot be a future timestamp'),
  payload: z.object({
    status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
    note: z.string().max(2000, 'Note cannot exceed 2000 characters').optional(),
  }),
});

export type ProgressEventDTO = z.infer<typeof progressEventSchema>;

