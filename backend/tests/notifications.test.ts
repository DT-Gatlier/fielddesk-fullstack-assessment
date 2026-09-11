import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PermanentNotificationError } from "../src/lib/notification-provider.js";
import { closeNotificationQueue } from "../src/queues/notifications.queue.js";
import { processNotificationJob } from "../src/services/notifications.service.js";
import { closePool, getPool } from "../src/db/pool.js";
import { cookiePair, uniqueScheduleWindow } from "./helpers.js";

const config = loadConfig();
const password = config.SEED_PASSWORD;

async function loginAs(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return cookiePair(response);
}

describe("Background notification processing", () => {
  const appPromise = buildApp(config);

  beforeAll(async () => {
    const app = await appPromise;
    await app.ready();
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
    await closeNotificationQueue();
    await closePool();
  });

  async function createAssignedWorkOrder(app: Awaited<ReturnType<typeof buildApp>>) {
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const pool = getPool(config);
    const techResult = await pool.query<{ id: string; organisation_id: string }>(
      `SELECT id, organisation_id FROM users WHERE email = 'tech@acme.test'`,
    );
    const technicianId = techResult.rows[0].id;
    const organisationId = techResult.rows[0].organisation_id;

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Notification test WO",
        description: "",
        priority: "medium",
        siteName: "Site",
      },
    });
    const workOrderId = create.json().workOrder.id as string;
    const window = uniqueScheduleWindow();

    await pool.query(
      `UPDATE work_orders
       SET assigned_technician_id = $2,
           status = 'scheduled',
           assignment_version = 1,
           scheduled_start = $3,
           scheduled_end = $4,
           updated_at = now()
       WHERE id = $1`,
      [workOrderId, technicianId, window.scheduledStart, window.scheduledEnd],
    );

    return {
      workOrderId,
      technicianId,
      assignmentVersion: 1,
      organisationId,
    };
  }

  it("records a sent notification and prevents duplicate delivery", async () => {
    const pool = getPool(config);
    const assignment = await createAssignedWorkOrder(await appPromise);
    const payload = {
      ...assignment,
      correlationId: "test-dedupe",
    };

    const first = await processNotificationJob(pool, payload, 1, "success");
    const second = await processNotificationJob(pool, payload, 1, "success");

    expect(first).toBe("sent");
    expect(second).toBe("already_sent");

    const rows = await pool.query(
      `SELECT COUNT(*)::text AS count FROM notification_deliveries
       WHERE work_order_id = $1 AND assignment_version = $2`,
      [assignment.workOrderId, assignment.assignmentVersion],
    );
    expect(Number(rows.rows[0].count)).toBe(1);

    const audit = await pool.query(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE action = 'notification.sent'
         AND entity_id = $1`,
      [assignment.workOrderId],
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it("retries transient failures and eventually succeeds", async () => {
    const pool = getPool(config);
    const assignment = await createAssignedWorkOrder(await appPromise);
    const payload = {
      ...assignment,
      correlationId: "test-transient",
    };

    await expect(
      processNotificationJob(pool, payload, 1, "transient"),
    ).rejects.toThrow("temporarily unavailable");

    await expect(
      processNotificationJob(pool, payload, 2, "transient"),
    ).rejects.toThrow("temporarily unavailable");

    const result = await processNotificationJob(pool, payload, 3, "transient");
    expect(result).toBe("sent");
  });

  it("marks permanent failures without further retries", async () => {
    const pool = getPool(config);
    const assignment = await createAssignedWorkOrder(await appPromise);
    const payload = {
      ...assignment,
      correlationId: "test-permanent",
    };

    await expect(
      processNotificationJob(pool, payload, 1, "permanent"),
    ).rejects.toBeInstanceOf(PermanentNotificationError);

    const row = await pool.query<{ status: string }>(
      `SELECT status FROM notification_deliveries
       WHERE work_order_id = $1 AND assignment_version = $2`,
      [assignment.workOrderId, assignment.assignmentVersion],
    );
    expect(row.rows[0].status).toBe("failed_permanent");

    const retry = await processNotificationJob(pool, payload, 2, "permanent");
    expect(retry).toBe("failed_permanent");
  });
});
