import { z } from "zod";

export const createWorkOrderSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().min(2, "Description must be at least 2 characters"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  siteName: z.string().min(2, "Site name must be at least 2 characters"),
  assignedTechnicianId: z.string().min(1).nullable().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(2).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  siteName: z.string().min(2).optional(),
  assignedTechnicianId: z.string().min(1).nullable().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
});

export const workOrderQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  technicianId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["createdAt", "scheduledStart", "priority", "referenceNumber"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const exportWorkOrderQuerySchema = z.object({
  status: z.enum(["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["ALL", "LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  technicianId: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderQueryInput = z.infer<typeof workOrderQuerySchema>;

