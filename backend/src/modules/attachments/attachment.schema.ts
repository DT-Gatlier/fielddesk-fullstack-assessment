import { z } from "zod";

export const attachmentParamsSchema = z.object({
  workOrderId: z.string().uuid(),
});

export const attachmentIdParamsSchema = z.object({
  id: z.string().uuid(),
});