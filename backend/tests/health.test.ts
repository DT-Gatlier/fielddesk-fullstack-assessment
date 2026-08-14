import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../src/app";

describe("Health check", () => {
  it("returns API health", async () => {
    const response = await request(app)
      .get("/health");

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "fielddesk-api",
    });
  });
});