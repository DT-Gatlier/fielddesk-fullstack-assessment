import { z } from "zod";
import {
  WorkOrderPriority,
  WorkOrderStatus,
} from "@prisma/client";

export const createWorkOrderSchema = z
  .object({
    referenceNumber: z
      .string()
      .trim()
      .min(1)
      .max(50),

    title: z
      .string()
      .trim()
      .min(1)
      .max(200),

    description: z
      .string()
      .trim()
      .max(5000)
      .optional(),

    priority: z.nativeEnum(WorkOrderPriority),

    status: z
      .nativeEnum(WorkOrderStatus)
      .optional(),

    assignedTechnicianId: z
      .string()
      .min(1)
      .optional(),

    scheduledStart: z
      .coerce
      .date()
      .optional(),

    scheduledEnd: z
      .coerce
      .date()
      .optional(),

    siteName: z
      .string()
      .trim()
      .min(1)
      .max(255),
  })
  .refine(
    (data) => {
      if (!data.scheduledStart || !data.scheduledEnd) {
        return true;
      }

      return data.scheduledEnd > data.scheduledStart;
    },
    {
      message: "Scheduled end must be after scheduled start",
      path: ["scheduledEnd"],
    },
  );

export const updateWorkOrderSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional(),

    description: z
      .string()
      .trim()
      .max(5000)
      .nullable()
      .optional(),

    priority: z
      .nativeEnum(WorkOrderPriority)
      .optional(),

    status: z
      .nativeEnum(WorkOrderStatus)
      .optional(),

    assignedTechnicianId: z
      .string()
      .min(1)
      .nullable()
      .optional(),

    scheduledStart: z
      .coerce
      .date()
      .nullable()
      .optional(),

    scheduledEnd: z
      .coerce
      .date()
      .nullable()
      .optional(),

    siteName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.scheduledStart === undefined ||
        data.scheduledEnd === undefined
      ) {
        return true;
      }

      if (
        data.scheduledStart === null ||
        data.scheduledEnd === null
      ) {
        return true;
      }

      return data.scheduledEnd > data.scheduledStart;
    },
    {
      message: "Scheduled end must be after scheduled start",
      path: ["scheduledEnd"],
    },
  );

export const workOrderListSchema = z.object({
  search: z.string().trim().optional(),

  status: z
    .nativeEnum(WorkOrderStatus)
    .optional(),

  priority: z
    .nativeEnum(WorkOrderPriority)
    .optional(),

  assignedTechnicianId: z
    .string()
    .optional(),

  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  sortBy: z
    .enum([
      "createdAt",
      "scheduledStart",
      "priority",
      "status",
    ])
    .default("createdAt"),

  sortOrder: z
    .enum(["asc", "desc"])
    .default("desc"),
});