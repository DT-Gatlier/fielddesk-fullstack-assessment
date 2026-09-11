import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closeNotificationQueue } from "../src/queues/notifications.queue.js";
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

describe("Critical workflow", () => {
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

  it("login → create → assign → status update completes end to end", async () => {
    const app = await appPromise;
    const pool = getPool(config);
    const dispatcherCookie = await loginAs(app, "dispatcher@acme.test");

    const loginCheck = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: dispatcherCookie },
    });
    expect(loginCheck.statusCode).toBe(200);
    expect(loginCheck.json().user.email).toBe("dispatcher@acme.test");

    const marker = `critical-flow-${crypto.randomUUID()}`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie: dispatcherCookie },
      payload: {
        title: marker,
        description: "End-to-end workflow test",
        priority: "medium",
        siteName: "Workflow Site",
      },
    });
    expect(create.statusCode).toBe(200);
    const workOrderId = create.json().workOrder.id as string;
    expect(create.json().workOrder.status).toBe("draft");

    const techResult = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'tech@acme.test'`,
    );
    const technicianId = techResult.rows[0].id;

    const assign = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/assign`,
      headers: { cookie: dispatcherCookie },
      payload: {
        assignedTechnicianId: technicianId,
        ...uniqueScheduleWindow(),
      },
    });
    expect(assign.statusCode).toBe(200);
    expect(assign.json().workOrder.status).toBe("scheduled");
    expect(assign.json().workOrder.assignedTechnicianId).toBe(technicianId);

    const techCookie = await loginAs(app, "tech@acme.test");
    const statusUpdate = await app.inject({
      method: "PATCH",
      url: `/api/v1/work-orders/${workOrderId}/status`,
      headers: { cookie: techCookie },
      payload: { status: "in_progress" },
    });
    expect(statusUpdate.statusCode).toBe(200);
    expect(statusUpdate.json().workOrder.status).toBe("in_progress");

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/work-orders/${workOrderId}`,
      headers: { cookie: dispatcherCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().workOrder.title).toBe(marker);
    expect(detail.json().workOrder.status).toBe("in_progress");
    expect(
      detail.json().activity.some(
        (entry: { action: string }) => entry.action === "work_order.created",
      ),
    ).toBe(true);
    expect(
      detail.json().activity.some(
        (entry: { action: string }) => entry.action === "work_order.assigned",
      ),
    ).toBe(true);
    expect(
      detail.json().activity.some(
        (entry: { action: string }) => entry.action === "work_order.status_changed",
      ),
    ).toBe(true);
  });
});
