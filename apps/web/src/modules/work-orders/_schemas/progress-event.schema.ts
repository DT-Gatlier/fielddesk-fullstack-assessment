import { z } from 'zod';

export const progressEventSchema = z.object({
  type: z.enum(['STATUS_CHANGED', 'NOTE_ADDED', 'WORK_STARTED', 'WORK_COMPLETED']),
  status: z
    .enum(['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .optional(),
  note: z
    .string()
    .trim()
    .max(2000, 'Note cannot exceed 2000 characters')
    .optional()
    .or(z.literal('')),
});

export type ProgressEventFormValues = z.infer<typeof progressEventSchema>;
