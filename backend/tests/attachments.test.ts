import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../src/config.js";
import { closePool, getPool } from "../src/db/pool.js";
import { cookiePair } from "./helpers.js";

const password = process.env.SEED_PASSWORD ?? "FieldDesk2026!";

function buildMultipartBody(
  filename: string,
  contentType: string,
  body: Buffer | string,
): { payload: Buffer; contentType: string } {
  const boundary = "----FieldDeskTestBoundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.isBuffer(body) ? body : Buffer.from(body),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const PDF_BODY = Buffer.from("%PDF-1.4\nFieldDesk test attachment\n");

async function loginAs(app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return cookiePair(response);
}

describe("Attachments and storage quotas", () => {
  let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;
  let config: Env;
  let attachmentsDir: string;

  beforeAll(async () => {
    attachmentsDir = await mkdtemp(join(tmpdir(), "fielddesk-attachments-"));
    process.env.ATTACHMENTS_DIR = attachmentsDir;
    process.env.MAX_ATTACHMENT_BYTES = "10485760";

    const { loadConfig } = await import("../src/config.js");
    const { buildApp } = await import("../src/app.js");
    config = loadConfig();
    app = await buildApp(config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
    await rm(attachmentsDir, { recursive: true, force: true });
  });

  async function createWorkOrder(
    targetApp: typeof app,
    cookie: string,
  ) {
    const response = await targetApp.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie },
      payload: {
        title: "Attachment test WO",
        description: "",
        priority: "low",
        siteName: "Site",
      },
    });
    expect(response.statusCode).toBe(200);
    return response.json().workOrder.id as string;
  }

  it("rejects unsupported file types", async () => {
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const workOrderId = await createWorkOrder(app, cookie);
    const { payload, contentType } = buildMultipartBody(
      "evil.pdf",
      "application/pdf",
      "This is not a PDF",
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/attachments`,
      headers: { cookie, "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects files exceeding the size limit", async () => {
    process.env.MAX_ATTACHMENT_BYTES = "50";
    const { loadConfig } = await import("../src/config.js");
    const { buildApp } = await import("../src/app.js");
    const limitedApp = await buildApp(loadConfig());
    await limitedApp.ready();

    try {
      const cookie = await loginAs(limitedApp, "dispatcher@acme.test");
      const workOrderId = await createWorkOrder(limitedApp, cookie);
      const oversized = Buffer.concat([PDF_BODY, Buffer.alloc(100)]);
      const { payload, contentType } = buildMultipartBody(
        "large.pdf",
        "application/pdf",
        oversized,
      );

      const response = await limitedApp.inject({
        method: "POST",
        url: `/api/v1/work-orders/${workOrderId}/attachments`,
        headers: { cookie, "content-type": contentType },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    } finally {
      await limitedApp.close();
      process.env.MAX_ATTACHMENT_BYTES = "10485760";
    }
  });

  it("enforces organisation storage quota", async () => {
    const pool = getPool(config);
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const workOrderId = await createWorkOrder(app, cookie);

    await pool.query(
      `UPDATE organisations
       SET storage_limit_bytes = 50, storage_used_bytes = 45
       WHERE id = (SELECT organisation_id FROM users WHERE email = 'dispatcher@acme.test')`,
    );

    const { payload, contentType } = buildMultipartBody(
      "quota.pdf",
      "application/pdf",
      PDF_BODY,
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/attachments`,
      headers: { cookie, "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("STORAGE_QUOTA_EXCEEDED");

    await pool.query(
      `UPDATE organisations
       SET storage_limit_bytes = 104857600, storage_used_bytes = 0
       WHERE id = (SELECT organisation_id FROM users WHERE email = 'dispatcher@acme.test')`,
    );
  });

  it("allows upload and authenticated download within the same org", async () => {
    const cookie = await loginAs(app, "dispatcher@acme.test");
    const workOrderId = await createWorkOrder(app, cookie);
    const { payload, contentType } = buildMultipartBody(
      "report.pdf",
      "application/pdf",
      PDF_BODY,
    );

    const upload = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/attachments`,
      headers: { cookie, "content-type": contentType },
      payload,
    });
    expect(upload.statusCode).toBe(200);
    const attachmentId = upload.json().attachment.id as string;

    const download = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${attachmentId}/download`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe("application/pdf");
    expect(download.rawPayload.toString()).toContain("%PDF");
  });

  it("denies cross-organisation attachment download", async () => {
    const acmeCookie = await loginAs(app, "dispatcher@acme.test");
    const workOrderId = await createWorkOrder(app, acmeCookie);
    const { payload, contentType } = buildMultipartBody(
      "secret.pdf",
      "application/pdf",
      PDF_BODY,
    );

    const upload = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/attachments`,
      headers: { cookie: acmeCookie, "content-type": contentType },
      payload,
    });
    const attachmentId = upload.json().attachment.id as string;

    const betaCookie = await loginAs(app, "dispatcher@beta.test");
    const download = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${attachmentId}/download`,
      headers: { cookie: betaCookie },
    });

    expect(download.statusCode).toBe(404);
  });

  it("denies technicians from uploading attachments", async () => {
    const cookie = await loginAs(app, "tech@acme.test");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/work-orders",
      headers: { cookie },
    });
    const workOrderId = (list.json().items as { id: string }[])[0]?.id;
    expect(workOrderId).toBeTruthy();

    const { payload, contentType } = buildMultipartBody(
      "note.pdf",
      "application/pdf",
      PDF_BODY,
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/work-orders/${workOrderId}/attachments`,
      headers: { cookie, "content-type": contentType },
      payload,
    });

    expect(response.statusCode).toBe(403);
  });
});
