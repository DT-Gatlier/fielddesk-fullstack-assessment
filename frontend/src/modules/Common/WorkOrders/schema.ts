import { z } from "zod"

export const createWorkOrderSchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title cannot exceed 200 characters"),
    description: z.string().max(2000, "Description cannot exceed 2000 characters").optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    siteName: z
      .string()
      .min(2, "Site name must be at least 2 characters")
      .max(120, "Site name cannot exceed 120 characters"),
    assignedTechnicianId: z.string().optional().nullable(),
    scheduledStart: z.string().optional().nullable(),
    scheduledEnd: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.scheduledStart && data.scheduledEnd) {
        return new Date(data.scheduledEnd) > new Date(data.scheduledStart)
      }
      return true
    },
    {
      message: "Scheduled end time must be after scheduled start time",
      path: ["scheduledEnd"],
    }
  )

export type CreateWorkOrderFormData = z.infer<typeof createWorkOrderSchema>

