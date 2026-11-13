import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";

const publicUser = (user: { id: string; email: string; name: string; role: string; isActive: boolean; createdAt: Date }) => user;

export class AdminService {
  async listUsers(organisationId: string) {
    const users = await prisma.user.findMany({
      where: { organisationId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return users.map(publicUser);
  }

  async createUser(organisationId: string, actorId: string, input: { email: string; name: string; password: string; role: "OWNER" | "DISPATCHER" | "TECHNICIAN" }) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { organisationId, email: input.email.toLowerCase(), name: input.name, passwordHash, role: input.role },
          select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });
        await tx.auditLog.create({ data: { organisationId, actorId, action: "user.created", targetType: "User", targetId: user.id, after: { email: user.email, name: user.name, role: user.role } } });
        return user;
      });
    } catch (error: any) {
      if (error?.code === "P2002") throw Object.assign(new Error("A user with that email already exists in this organisation"), { status: 409 });
      throw error;
    }
  }

  async updateUser(organisationId: string, actorId: string, userId: string, input: { name?: string; role?: "OWNER" | "DISPATCHER" | "TECHNICIAN"; isActive?: boolean }) {
    const existing = await prisma.user.findFirst({ where: { id: userId, organisationId }, select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } });
    if (!existing) throw Object.assign(new Error("User not found"), { status: 404 });
    if (userId === actorId && (input.role && input.role !== "OWNER" || input.isActive === false)) throw Object.assign(new Error("You cannot remove your own owner access"), { status: 400 });
    const nextRole = input.role ?? existing.role;
    const nextActive = input.isActive ?? existing.isActive;
    if (existing.role === "OWNER" && existing.isActive && (nextRole !== "OWNER" || !nextActive)) {
      const activeOwners = await prisma.user.count({ where: { organisationId, role: "OWNER", isActive: true } });
      if (activeOwners <= 1) throw Object.assign(new Error("An organisation must keep at least one active owner"), { status: 409 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (existing.role === "OWNER" && existing.isActive && (nextRole !== "OWNER" || !nextActive)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organisationId + ":owner-admin"}, 0))`;
        const activeOwners = await tx.user.count({ where: { organisationId, role: "OWNER", isActive: true } });
        if (activeOwners <= 1) throw Object.assign(new Error("An organisation must keep at least one active owner"), { status: 409 });
      }
      const result = await tx.user.update({ where: { id: userId }, data: input, select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } });
      await tx.auditLog.create({ data: { organisationId, actorId, action: "user.updated", targetType: "User", targetId: userId, before: { name: existing.name, role: existing.role, isActive: existing.isActive }, after: { name: result.name, role: result.role, isActive: result.isActive } } });
      return result;
    });
    return updated;
  }

  async getOrganisation(organisationId: string) {
    const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, slug: true, storageUsedBytes: true, storageLimitBytes: true } });
    if (!org) throw Object.assign(new Error("Organisation not found"), { status: 404 });
    return { ...org, storageUsedBytes: org.storageUsedBytes.toString(), storageLimitBytes: org.storageLimitBytes.toString() };
  }

  async updateOrganisation(organisationId: string, actorId: string, input: { name?: string; storageLimitBytes?: number }) {
    const before = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true, storageUsedBytes: true, storageLimitBytes: true } });
    if (!before) throw Object.assign(new Error("Organisation not found"), { status: 404 });
    if (input.storageLimitBytes !== undefined && BigInt(input.storageLimitBytes) < before.storageUsedBytes) throw Object.assign(new Error("Storage limit cannot be lower than current usage"), { status: 400 });
    const updated = await prisma.$transaction(async (tx) => {
      const org = await tx.organisation.update({ where: { id: organisationId }, data: input.storageLimitBytes === undefined ? { name: input.name } : { name: input.name, storageLimitBytes: BigInt(input.storageLimitBytes) }, select: { id: true, name: true, slug: true, storageUsedBytes: true, storageLimitBytes: true } });
      await tx.auditLog.create({ data: { organisationId, actorId, action: "organisation.updated", targetType: "Organisation", targetId: organisationId, before: { name: before.name, storageLimitBytes: before.storageLimitBytes.toString() }, after: { name: org.name, storageLimitBytes: org.storageLimitBytes.toString() } } });
      return org;
    });
    return { ...updated, storageUsedBytes: updated.storageUsedBytes.toString(), storageLimitBytes: updated.storageLimitBytes.toString() };
  }

  async listAudit(organisationId: string, take = 100) {
    return prisma.auditLog.findMany({ where: { organisationId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(take, 1), 200), include: { actor: { select: { id: true, name: true, email: true } } } });
  }

  async listNotifications(organisationId: string, take = 100) {
    return prisma.notificationDelivery.findMany({ where: { organisationId }, orderBy: { queuedAt: "desc" }, take: Math.min(Math.max(take, 1), 200) });
  }
}
