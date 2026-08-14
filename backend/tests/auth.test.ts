import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app";

describe("Authentication", () => {
  it("rejects missing credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({});

    expect(response.status).toBe(400);

    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects invalid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "owner.a@fielddesk.test",
        password: "wrong-password",
      });

    expect(response.status).toBe(401);

    expect(response.body.error.code).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("logs in a valid user", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "owner.a@fielddesk.test",
        password: "Password@123",
      });

    expect(response.status).toBe(200);

    expect(response.body.token).toBeDefined();

    expect(response.body.user.email).toBe(
      "owner.a@fielddesk.test",
    );

    expect(response.body.user.organisationId).toBe(
      "org-a",
    );
  });
});