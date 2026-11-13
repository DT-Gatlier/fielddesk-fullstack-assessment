import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const orgA = "org-apex-001";
const orgB = "org-metro-002";
const marker = `integration-${Date.now()}`;
let ownerCookie = "";
let technicianCookie = "";
let createdWorkOrderIds: string[] = [];

async function login(email: string, organisationId: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password: "password123", organisationId });
  expect(response.status).toBe(200);
  return response.headers["set-cookie"][0].split(";")[0] as string;
}

beforeAll(async () => {
  ownerCookie = await login("owner@apex.com", orgA);
  technicianCookie = await login("tech@apex.com", orgA);
});

afterAll(async () => {
  const leftovers = await prisma.workOrder.findMany({ where: { title: { contains: marker } }, select: { id: true } });
  createdWorkOrderIds = [...new Set([...createdWorkOrderIds, ...leftovers.map((order) => order.id)])];
  if (createdWorkOrderIds.length) {
    await prisma.notificationDelivery.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: createdWorkOrderIds } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  const testUser = await prisma.user.findUnique({ where: { email_organisationId: { email: `${marker}@example.test`, organisationId: orgA } }, select: { id: true } });
  if (testUser) {
    await prisma.auditLog.deleteMany({ where: { targetId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }
  await prisma.$disconnect();
});

describe("admin and reporting integrations", () => {
  it("authenticates seeded accounts and rejects invalid credentials", async () => {
    const good = await request(app).post("/api/auth/login").send({ email: "owner@apex.com", password: "password123", organisationId: orgA });
    const bad = await request(app).post("/api/auth/login").send({ email: "owner@apex.com", password: "wrong", organisationId: orgA });
    expect(good.status).toBe(200);
    expect(bad.status).toBe(401);
  });

  it("restricts admin routes to owners and scopes members to their tenant", async () => {
    const forbidden = await request(app).get("/api/admin/users").set("Cookie", technicianCookie);
    const users = await request(app).get("/api/admin/users").set("Cookie", ownerCookie);
    expect(forbidden.status).toBe(403);
    expect(users.status).toBe(200);
    expect(users.body.users.every((user: { email: string }) => !user.email.endsWith("@metro.com"))).toBe(true);
    const crossTenantOrder = await request(app).get("/api/work-orders/wo-metro-001").set("Cookie", ownerCookie);
    expect(crossTenantOrder.status).toBe(404);
  });

  it("creates a tenant-scoped user and records the action in audit history", async () => {
    const created = await request(app).post("/api/admin/users").set("Cookie", ownerCookie).send({ name: "Integration Member", email: `${marker}@example.test`, password: "valid-test-pass", role: "DISPATCHER", organisationId: orgB });
    expect(created.status).toBe(201);
    const createdUserId = created.body.user.id as string;
    expect((await prisma.user.findUnique({ where: { id: createdUserId } }))?.organisationId).toBe(orgA);
    const audit = await request(app).get("/api/admin/audit").set("Cookie", ownerCookie);
    expect(audit.status).toBe(200);
    expect(audit.body.entries.some((entry: { action: string; targetId: string }) => entry.action === "user.created" && entry.targetId === createdUserId)).toBe(true);
    const roleChange = await request(app).patch(`/api/admin/users/${createdUserId}`).set("Cookie", ownerCookie).send({ role: "TECHNICIAN" });
    expect(roleChange.status).toBe(200);
    expect(roleChange.body.user.role).toBe("TECHNICIAN");
    const otherTenant = await request(app).get("/api/admin/users").set("Cookie", await login("owner@metro.com", orgB));
    expect(otherTenant.status).toBe(200);
    expect(otherTenant.body.users.some((user: { id: string }) => user.id === createdUserId)).toBe(false);
  });

  it("exports only the authenticated organisation and neutralizes spreadsheet formulas", async () => {
    const created = await request(app).post("/api/work-orders").set("Cookie", ownerCookie).send({ title: "=2+2", description: "CSV formula check", siteName: "Test site", priority: "LOW" });
    expect(created.status).toBe(201);
    createdWorkOrderIds.push(created.body.workOrder.id);
    const csv = await request(app).get("/api/work-orders/export").set("Cookie", ownerCookie);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("'=2+2");
    expect(csv.text).not.toContain("WO-2026-101");
  });

  it("records duplicate technician progress submissions only once", async () => {
    const created = await request(app).post("/api/work-orders").set("Cookie", ownerCookie).send({ title: `${marker} event`, description: "Event idempotency check", siteName: "Test site", priority: "LOW", assignedTechnicianId: "usr-apex-technician" });
    expect(created.status).toBe(201);
    const workOrderId = created.body.workOrder.id as string;
    createdWorkOrderIds.push(workOrderId);
    const notificationList = await request(app).get("/api/admin/notifications").set("Cookie", ownerCookie);
    expect(notificationList.status).toBe(200);
    expect(notificationList.body.deliveries.some((delivery: { workOrderId: string }) => delivery.workOrderId === workOrderId)).toBe(true);
    const event = { eventId: `${marker}-event`, workOrderId, type: "note_added", occurredAt: new Date().toISOString(), payload: { note: "one accepted event" } };
    const first = await request(app).post("/api/progress-events").set("Cookie", technicianCookie).send(event);
    const duplicate = await request(app).post("/api/progress-events").set("Cookie", technicianCookie).send(event);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.isDuplicate).toBe(true);
    const conflicting = await request(app).post("/api/progress-events").set("Cookie", technicianCookie).send({ ...event, payload: { note: "different payload" } });
    expect(conflicting.status).toBe(409);
    expect(await prisma.progressEvent.count({ where: { eventId: event.eventId } })).toBe(1);
    const invalid = await request(app).post("/api/progress-events").set("Cookie", technicianCookie).send({ ...event, eventId: `${marker}-invalid`, type: "status_changed", payload: { status: "UNKNOWN" } });
    expect(invalid.status).toBe(400);
    expect(await prisma.progressEvent.count({ where: { eventId: `${marker}-invalid` } })).toBe(0);
    const badFile = await request(app).post(`/api/work-orders/${workOrderId}/attachments`).set("Cookie", technicianCookie).attach("file", Buffer.from("not an allowed file"), { filename: "note.txt", contentType: "text/plain" });
    expect(badFile.status).toBe(400);
  });

  it("allows only one simultaneous overlapping technician assignment", async () => {
    const start = "2042-05-01T10:00:00.000Z";
    const body = (title: string) => ({ title, description: "Concurrent schedule test", siteName: "Test site", priority: "LOW", assignedTechnicianId: "usr-apex-technician", scheduledStart: start, scheduledEnd: "2042-05-01T11:00:00.000Z" });
    const [first, second] = await Promise.all([
      request(app).post("/api/work-orders").set("Cookie", ownerCookie).send(body(`${marker} overlap A`)),
      request(app).post("/api/work-orders").set("Cookie", ownerCookie).send(body(`${marker} overlap B`)),
    ]);
    const responses = [first, second];
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    createdWorkOrderIds.push(...responses.filter((response) => response.status === 201).map((response) => response.body.workOrder.id));
  });
});
