import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closePool, getPool } from "../src/db/pool.js";
import { cookiePair } from "./helpers.js";

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

describe("Concurrent scheduling protection", () => {
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

  it("allows only one overlapping assignment when two dispatchers assign concurrently", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const pool = getPool(config);

    const techResult = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'tech@acme.test'`,
    );
    const technicianId = techResult.rows[0].id;

    const createOne = async (title: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/work-orders",
        headers: { cookie },
        payload: {
          title,
          description: "Concurrency test",
          priority: "medium",
          siteName: "Test Site",
        },
      });
      expect(response.statusCode).toBe(200);
      return response.json().workOrder.id as string;
    };

    const workOrderA = await createOne("Concurrent A");
    const workOrderB = await createOne("Concurrent B");

    const window = {
      assignedTechnicianId: technicianId,
      scheduledStart: "2026-12-10T09:00:00.000Z",
      scheduledEnd: "2026-12-10T11:00:00.000Z",
    };

    const assign = (workOrderId: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/work-orders/${workOrderId}/assign`,
        headers: { cookie },
        payload: window,
      });

    const [first, second] = await Promise.all([
      assign(workOrderA),
      assign(workOrderB),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const conflict = first.statusCode === 409 ? first : second;
    expect(conflict.json().error.code).toBe("SCHEDULING_CONFLICT");
  });

  it("rejects overlapping assignment detected before update", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const pool = getPool(config);

    const techResult = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'tech@acme.test'`,
    );
    const technicianId = techResult.rows[0].id;

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Overlap follow-up",
        description: "",
        priority: "low",
        siteName: "Site",
      },
    });
    const workOrderId = create.json().workOrder.id as string;

    const payload = {
      assignedTechnicianId: technicianId,
      scheduledStart: "2026-12-11T09:00:00.000Z",
      scheduledEnd: "2026-12-11T11:00:00.000Z",
    };

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/assign`,
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(200);

    const secondCreate = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Overlap second",
        description: "",
        priority: "low",
        siteName: "Site",
      },
    });
    const secondId = secondCreate.json().workOrder.id as string;

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${secondId}/assign`,
      headers: { cookie },
      payload: {
        ...payload,
        scheduledStart: "2026-12-11T10:00:00.000Z",
        scheduledEnd: "2026-12-11T12:00:00.000Z",
      },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("SCHEDULING_CONFLICT");
  });
});
