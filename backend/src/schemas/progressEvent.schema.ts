import { z } from 'zod';
import { EventType } from '@prisma/client';

export const submitEventSchema = z.object({
  body: z.object({
    eventId: z.string().min(1, 'eventId is required'),
    workOrderId: z.string().uuid('workOrderId must be a valid UUID'),
    type: z.nativeEnum(EventType),
    occurredAt: z.preprocess((arg) => (typeof arg === 'string' || arg instanceof Date ? new Date(arg) : arg), z.date()),
    payload: z.record(z.any()), // flexible JSON payload
  }),
});
