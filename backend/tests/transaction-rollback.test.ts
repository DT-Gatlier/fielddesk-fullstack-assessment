import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("Transaction rollback", () => {
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

  it("does not persist progress events or audit rows when submission fails", async () => {
    const app = await appPromise;
    const pool = getPool(config);
    const techCookie = await loginAs(app, "tech@acme.test");
    const eventId = `evt-rollback-${crypto.randomUUID()}`;
    const missingWorkOrderId = "00000000-0000-4000-8000-000000000001";

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/progress-events",
      headers: { cookie: techCookie },
      payload: {
        eventId,
        workOrderId: missingWorkOrderId,
        type: "status_changed",
        occurredAt: new Date().toISOString(),
        payload: { status: "in_progress" },
      },
    });

    expect(response.statusCode).toBe(404);

    const eventRows = await pool.query(
      `SELECT id FROM progress_events WHERE event_id = $1`,
      [eventId],
    );
    expect(eventRows.rowCount).toBe(0);

    const auditRows = await pool.query(
      `SELECT id FROM audit_logs WHERE metadata->>'eventId' = $1`,
      [eventId],
    );
    expect(auditRows.rowCount).toBe(0);
  });
});
