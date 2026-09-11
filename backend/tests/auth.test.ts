import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closePool } from "../src/db/pool.js";
import { cookiePair } from "./helpers.js";

const config = loadConfig();
const password = config.SEED_PASSWORD;

describe("Authentication and organisation isolation", () => {
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

  it("logs in with valid credentials and sets httpOnly cookie", async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe("owner@acme.test");
    expect(body.user.role).toBe("owner");
    expect(response.headers["set-cookie"]).toMatch(/access_token=/);
    expect(response.headers["set-cookie"]).toMatch(/HttpOnly/i);
  });

  it("rejects invalid credentials", async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns current user from /auth/me when authenticated", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "dispatcher@acme.test",
        password,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookiePair(login),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("dispatcher@acme.test");
    expect(response.json().user.role).toBe("dispatcher");
  });

  it("rejects /auth/me without a session cookie", async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("allows owners to list users in their organisation", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: {
        cookie: cookiePair(login),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users).toHaveLength(3);
  });

  it("denies technicians from listing organisation users", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "tech@acme.test",
        password,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: {
        cookie: cookiePair(login),
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when accessing a user from another organisation", async () => {
    const app = await appPromise;

    const betaLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@beta.test",
        password,
      },
    });
    const betaUserId = betaLogin.json().user.id;

    const acmeLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/users/${betaUserId}`,
      headers: {
        cookie: cookiePair(acmeLogin),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("accepts logout without a JSON body", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password,
      },
    });

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: cookiePair(login),
      },
    });

    expect(logout.statusCode).toBe(200);
  });

  it("clears session cookie on logout", async () => {
    const app = await appPromise;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "owner@acme.test",
        password,
      },
    });

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: cookiePair(login),
      },
    });

    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(me.statusCode).toBe(401);
  });
});
