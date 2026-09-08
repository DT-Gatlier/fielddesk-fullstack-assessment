import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closePool } from "../src/db/pool.js";
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

describe("Work order management", () => {
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

  it("allows dispatchers to create work orders", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "dispatcher@acme.test");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Test work order",
        description: "Created in integration test",
        priority: "high",
        siteName: "Test Site",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workOrder.title).toBe("Test work order");
    expect(response.json().workOrder.organisationId).toBeTruthy();
  });

  it("denies technicians from creating work orders", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "tech@acme.test");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Should fail",
        description: "",
        priority: "low",
        siteName: "Site",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("lists work orders scoped to organisation", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "owner@acme.test");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBeGreaterThan(0);
    expect(response.json().items.every((item: { organisationId: string }) => item.organisationId)).toBe(true);
  });

  it("returns 404 for cross-organisation work order access", async () => {
    const app = await appPromise;

    const betaCookie = await loginAs(app, "owner@beta.test");
    const betaList = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders",
      headers: { cookie: betaCookie },
    });
    const betaWorkOrderId = betaList.json().items[0].id;

    const acmeCookie = await loginAs(app, "owner@acme.test");
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/work-orders/${betaWorkOrderId}`,
      headers: { cookie: acmeCookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it("shows technicians only their assigned work orders", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "tech@acme.test");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    for (const item of response.json().items) {
      expect(item.assignedTechnicianId).toBeTruthy();
    }
  });

  it("validates assign payload", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "dispatcher@acme.test");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders?status=draft",
      headers: { cookie },
    });
    const workOrderId = list.json().items[0].id;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/assign`,
      headers: { cookie },
      payload: {
        assignedTechnicianId: "00000000-0000-0000-0000-000000000099",
        scheduledStart: "2026-12-01T10:00:00.000Z",
        scheduledEnd: "2026-12-01T09:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns dashboard summary counts", async () => {
    const app = await appPromise;
    const cookie = await loginAs(app, "owner@acme.test");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().summary.total).toBeGreaterThan(0);
  });
});
