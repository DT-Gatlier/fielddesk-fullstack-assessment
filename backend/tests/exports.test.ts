import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { escapeCsvCell } from "../src/lib/csv.js";
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

describe("CSV export", () => {
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

  it("prefixes formula-like values to prevent spreadsheet injection", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell("+1234")).toBe("'+1234");
  });

  it("exports only the authenticated organisation's work orders", async () => {
    const app = await appPromise;
    const acmeCookie = await loginAs(app, "dispatcher@acme.test");
    const betaCookie = await loginAs(app, "dispatcher@beta.test");
    const marker = `export-isolation-${crypto.randomUUID()}`;

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie: acmeCookie },
      payload: {
        title: marker,
        description: "",
        priority: "low",
        siteName: "Export Test Site",
      },
    });
    expect(create.statusCode).toBe(200);

    const acmeExport = await app.inject({
      method: "GET",
      url: "/api/v1/exports/work-orders.csv",
      headers: { cookie: acmeCookie },
    });
    expect(acmeExport.statusCode).toBe(200);
    expect(acmeExport.headers["content-type"]).toContain("text/csv");
    expect(acmeExport.body).toContain(marker);

    const betaExport = await app.inject({
      method: "GET",
      url: "/api/v1/exports/work-orders.csv",
      headers: { cookie: betaCookie },
    });
    expect(betaExport.statusCode).toBe(200);
    expect(betaExport.body).not.toContain(marker);
  });
});
