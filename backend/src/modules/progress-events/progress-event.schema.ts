import { z } from "zod";

export const createProgressEventSchema = z.object({
  type: z.string().min(1).max(100),

  occurredAt: z.coerce.date().optional(),

  payload: z.record(z.string(), z.unknown()),
});