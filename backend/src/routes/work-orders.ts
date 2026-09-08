import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import { authenticate } from "../middleware/auth.js";
import { listAuditLogsForEntity } from "../repositories/audit.repository.js";
import {
  assignWorkOrderForOrg,
  createWorkOrderForOrg,
  getDashboardForOrg,
  getWorkOrderDetail,
  listWorkOrdersForOrg,
  toPublicWorkOrder,
  updateWorkOrderForOrg,
  updateWorkOrderStatusForOrg,
} from "../services/work-orders.service.js";

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const statusSchema = z.enum([
  "draft",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  priority: prioritySchema.default("medium"),
  siteName: z.string().min(1).max(200),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: prioritySchema.optional(),
  siteName: z.string().min(1).max(200).optional(),
});

const assignSchema = z.object({
  assignedTechnicianId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
});

const statusUpdateSchema = z.object({
  status: statusSchema,
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  sortBy: z
    .enum(["created_at", "scheduled_start", "priority", "status"])
    .default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function registerWorkOrderRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);

  app.get(
    "/api/v1/work-orders",
    { preHandler: [authenticate] },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const result = await listWorkOrdersForOrg(pool, request.auth, query);
      return {
        ...result,
        items: result.items.map(toPublicWorkOrder),
      };
    },
  );

  app.post(
    "/api/v1/work-orders",
    { preHandler: [authenticate] },
    async (request) => {
      const body = createSchema.parse(request.body);
      const workOrder = await createWorkOrderForOrg(pool, request.auth, body);
      return { workOrder: toPublicWorkOrder(workOrder) };
    },
  );

  app.get(
    "/api/v1/work-orders/:workOrderId",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const workOrder = await getWorkOrderDetail(pool, request.auth, workOrderId);
      const activity = await listAuditLogsForEntity(
        pool,
        request.auth.organisationId,
        "work_order",
        workOrderId,
      );
      return { workOrder: toPublicWorkOrder(workOrder), activity };
    },
  );

  app.patch(
    "/api/v1/work-orders/:workOrderId",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const body = updateSchema.parse(request.body);
      const workOrder = await updateWorkOrderForOrg(
        pool,
        request.auth,
        workOrderId,
        body,
      );
      return { workOrder: toPublicWorkOrder(workOrder) };
    },
  );

  app.post(
    "/api/v1/work-orders/:workOrderId/assign",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const body = assignSchema.parse(request.body);
      const workOrder = await assignWorkOrderForOrg(
        pool,
        request.auth,
        workOrderId,
        body,
      );
      return { workOrder: toPublicWorkOrder(workOrder) };
    },
  );

  app.patch(
    "/api/v1/work-orders/:workOrderId/status",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const body = statusUpdateSchema.parse(request.body);
      const workOrder = await updateWorkOrderStatusForOrg(
        pool,
        request.auth,
        workOrderId,
        body.status,
      );
      return { workOrder: toPublicWorkOrder(workOrder) };
    },
  );

  app.get(
    "/api/v1/dashboard/summary",
    { preHandler: [authenticate] },
    async (request) => {
      const summary = await getDashboardForOrg(pool, request.auth);
      return { summary };
    },
  );
}
