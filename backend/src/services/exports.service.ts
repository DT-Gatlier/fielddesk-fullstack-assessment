import type pg from "pg";
import { Readable } from "node:stream";
import { AppError } from "../lib/errors.js";
import { formatCsvRow } from "../lib/csv.js";
import { iterateWorkOrdersForExport } from "../repositories/work-orders.repository.js";
import { canManageWorkOrders } from "./work-orders.service.js";
import type { AuthContext } from "../types/auth.js";
import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from "../types/work-order.js";

export type WorkOrderExportFilters = {
  search?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  sortBy: "created_at" | "scheduled_start" | "priority" | "status";
  sortOrder: "asc" | "desc";
};

const CSV_HEADER = formatCsvRow([
  "reference_number",
  "title",
  "description",
  "priority",
  "status",
  "site_name",
  "assigned_technician_id",
  "scheduled_start",
  "scheduled_end",
  "created_at",
  "updated_at",
]);

export function createWorkOrdersCsvStream(
  pool: pg.Pool,
  auth: AuthContext,
  filters: WorkOrderExportFilters,
): Readable {
  if (!canManageWorkOrders(auth.role) && auth.role !== "technician") {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const assignedTechnicianId =
    auth.role === "technician" ? auth.userId : undefined;

  let iterator: AsyncGenerator<
    {
      referenceNumber: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      siteName: string;
      assignedTechnicianId: string | null;
      scheduledStart: string | null;
      scheduledEnd: string | null;
      createdAt: string;
      updatedAt: string;
    },
    void,
    unknown
  >;

  return new Readable({
    async read() {
      try {
        if (!iterator) {
          this.push(CSV_HEADER);
          iterator = iterateWorkOrdersForExport(pool, {
            organisationId: auth.organisationId,
            assignedTechnicianId,
            ...filters,
          });
        }

        const { value, done } = await iterator.next();
        if (done) {
          this.push(null);
          return;
        }

        this.push(
          formatCsvRow([
            value.referenceNumber,
            value.title,
            value.description,
            value.priority,
            value.status,
            value.siteName,
            value.assignedTechnicianId,
            value.scheduledStart,
            value.scheduledEnd,
            value.createdAt,
            value.updatedAt,
          ]),
        );
      } catch (error) {
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}
