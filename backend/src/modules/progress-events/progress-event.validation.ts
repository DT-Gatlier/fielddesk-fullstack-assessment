import { z } from "zod";

const progressPayloadSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "pending", "in_progress", "completed", "cancelled"]).transform((value) => value.toUpperCase()).optional(),
  note: z.string().max(2000).optional(),
}).strict().refine((payload) => payload.status !== undefined || payload.note !== undefined, "Provide a status or note");

export const createProgressEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  workOrderId: z.string().min(1).max(128),
  type: z.enum(["status_changed", "note_added"]),
  occurredAt: z.string().datetime(),
  payload: progressPayloadSchema,
}).superRefine((event, ctx) => {
  if (event.type === "status_changed" && event.payload.status === undefined) ctx.addIssue({ code: "custom", path: ["payload", "status"], message: "status_changed events require a status" });
  if (event.type === "note_added" && typeof event.payload.note !== "string") ctx.addIssue({ code: "custom", path: ["payload", "note"], message: "note_added events require a note" });
  if (event.type === "note_added" && event.payload.status !== undefined) ctx.addIssue({ code: "custom", path: ["payload", "status"], message: "note_added events cannot change status" });
});

export type CreateProgressEventInput = z.infer<typeof createProgressEventSchema>;

