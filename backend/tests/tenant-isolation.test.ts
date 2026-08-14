import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";

describe("Organisation tenant isolation", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should contain users within their own organisation", async () => {
    const organisationAUsers = await prisma.user.findMany({
      where: {
        organisationId: "org-a",
      },
    });

    const organisationBUsers = await prisma.user.findMany({
      where: {
        organisationId: "org-b",
      },
    });

    expect(organisationAUsers).toHaveLength(3);
    expect(organisationBUsers).toHaveLength(3);

    expect(
      organisationAUsers.every((user) => user.organisationId === "org-a"),
    ).toBe(true);

    expect(
      organisationBUsers.every((user) => user.organisationId === "org-b"),
    ).toBe(true);
  });

  it("should prevent a work order from referencing a user from another organisation", async () => {
    await expect(
      prisma.workOrder.create({
        data: {
          id: "cross-org-test-work-order",
          organisationId: "org-a",
          createdById: "user-b-dispatcher",
          referenceNumber: "CROSS-ORG-001",
          title: "Cross organisation test",
          description: "This should fail",
          priority: "MEDIUM",
          status: "PENDING",
          siteName: "Test Site",
        },
      }),
    ).rejects.toThrow();
  });

  it("should allow a work order to reference a user from the same organisation", async () => {
    const workOrder = await prisma.workOrder.create({
      data: {
        id: "same-org-test-work-order",
        organisationId: "org-a",
        createdById: "user-a-dispatcher",
        referenceNumber: "SAME-ORG-001",
        title: "Same organisation test",
        description: "This should succeed",
        priority: "MEDIUM",
        status: "PENDING",
        siteName: "Test Site",
      },
    });

    expect(workOrder.organisationId).toBe("org-a");
    expect(workOrder.createdById).toBe("user-a-dispatcher");

    await prisma.workOrder.delete({
      where: {
        id: "same-org-test-work-order",
      },
    });
  });
});
