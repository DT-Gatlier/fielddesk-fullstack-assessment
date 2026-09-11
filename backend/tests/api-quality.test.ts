import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closePool } from "../src/db/pool.js";

const config = loadConfig();

describe("API operational quality", () => {
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

  it("returns correlation IDs on success and error responses", async () => {
    const app = await appPromise;

    const health = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-correlation-id": "test-correlation-123" },
    });
    expect(health.statusCode).toBe(200);
    expect(health.headers["x-correlation-id"]).toBe("test-correlation-123");

    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["x-correlation-id"]).toBeTruthy();
    expect(unauthorized.json().error.correlationId).toBe(
      unauthorized.headers["x-correlation-id"],
    );
  });

  it("rejects invalid UUID path parameters with validation error", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "owner@acme.test", password: config.SEED_PASSWORD },
    });
    const cookie = login.headers["set-cookie"];
    const cookieHeader = Array.isArray(cookie) ? cookie[0].split(";")[0] : cookie!.split(";")[0];

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/not-a-uuid",
      headers: { cookie: cookieHeader },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});
