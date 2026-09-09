import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
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

function progressEventPayload(
  workOrderId: string,
  eventId: string,
  status: "in_progress" | "completed" = "in_progress",
) {
  return {
    eventId,
    workOrderId,
    type: "status_changed" as const,
    occurredAt: "2026-08-04T10:30:00.000Z",
    payload: { status, note: "Work started" },
  };
}

describe("Idempotent progress events", () => {
  const appPromise = buildApp(config);

  beforeAll(async () => {
    const app = await appPromise;
    await app.ready();
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
    await closePool();
  });

  async function getAssignedWorkOrderId(app: Awaited<ReturnType<typeof buildApp>>) {
    const cookie = await loginAs(app, "tech@acme.test");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders?status=scheduled",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as { id: string }[];
    expect(items.length).toBeGreaterThan(0);
    return { cookie, workOrderId: items[0].id };
  }

  it("rejects progress events from non-technicians", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const pool = getPool(config);
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM work_orders WHERE reference_number = 'WO-00001'`,
    );
    const workOrderId = result.rows[0].id;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/progress-events",
      headers: { cookie },
      payload: progressEventPayload(workOrderId, "evt-dispatcher-denied"),
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns the same success response for duplicate eventId", async () => {
    const app = await appPromise;
    const { cookie, workOrderId } = await getAssignedWorkOrderId(app);
    const eventId = `evt-duplicate-${crypto.randomUUID()}`;
    const payload = progressEventPayload(workOrderId, eventId);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/progress-events",
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/progress-events",
      headers: { cookie },
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();

    expect(secondBody.event.id).toBe(firstBody.event.id);
    expect(secondBody.event.eventId).toBe(eventId);
    expect(secondBody.workOrder.status).toBe("in_progress");

    const pool = getPool(config);
    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM audit_logs
       WHERE action = 'progress_event.accepted'
         AND metadata->>'eventId' = $1`,
      [eventId],
    );
    expect(Number(auditCount.rows[0].count)).toBe(1);
  });

  it("handles concurrent duplicate submissions safely", async () => {
    const app = await appPromise;
    const pool = getPool(config);
    const dispatcherCookie = await loginAs(app, "dispatcher@acme.test");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie: dispatcherCookie },
      payload: {
        title: "Progress concurrency test",
        description: "",
        priority: "medium",
        siteName: "Test Site",
      },
    });
    expect(created.statusCode).toBe(200);
    const workOrderId = created.json().workOrder.id as string;

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

    const techCookie = await loginAs(app, "tech@acme.test");
    const eventId = `evt-concurrent-${crypto.randomUUID()}`;
    const payload = progressEventPayload(workOrderId, eventId);

    const submit = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/progress-events",
        headers: { cookie: techCookie },
        payload,
      });

    const [first, second] = await Promise.all([submit(), submit()]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().event.id).toBe(second.json().event.id);
    expect(first.json().workOrder.status).toBe("in_progress");

    const eventRows = await pool.query(
      `SELECT id FROM progress_events WHERE event_id = $1`,
      [eventId],
    );
    expect(eventRows.rowCount).toBe(1);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM audit_logs
       WHERE action = 'progress_event.accepted'
         AND metadata->>'eventId' = $1`,
      [eventId],
    );
    expect(Number(auditCount.rows[0].count)).toBe(1);
  });
});
