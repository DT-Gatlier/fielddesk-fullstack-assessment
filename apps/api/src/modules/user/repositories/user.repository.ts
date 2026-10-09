import type { Prisma, UserRole } from '@fielddesk/database';
import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type { UserRepositoryPort } from '../interfaces/user-repository.interface';
import type {
  CreateUserEntityInput,
  PaginatedUsers,
  PaginationParams,
  UpdateUserInput,
  UserFilterInput,
  UserModel,
} from '../interfaces/user.interface';

const userSelect = {
  id: true,
  organisationId: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(private readonly database: PrismaService) {}

  findById(organisationId: string, userId: string): Promise<UserModel | null> {
    return this.database.client.user.findFirst({
      where: { id: userId, organisationId },
      select: userSelect,
    });
  }

  findByEmail(email: string): Promise<UserModel | null> {
    return this.database.client.user.findUnique({
      where: { email },
      select: userSelect,
    });
  }

  async listByOrganisation(
    organisationId: string,
    filter: UserFilterInput,
    pagination: PaginationParams,
  ): Promise<PaginatedUsers> {
    const trimmedSearch = filter.search?.trim();
    const where: Prisma.UserWhereInput = {
      organisationId,
      ...(filter.role ? { role: filter.role } : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { name: { contains: trimmedSearch, mode: 'insensitive' } },
              { email: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const take = pagination.limit;

    const [items, total] = await Promise.all([
      this.database.client.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.database.client.user.count({ where }),
    ]);

    return {
      items,
      total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  create(
    organisationId: string,
    input: CreateUserEntityInput,
  ): Promise<UserModel> {
    return this.database.client.user.create({
      data: {
        organisationId,
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
      },
      select: userSelect,
    });
  }

  async update(
    organisationId: string,
    userId: string,
    input: UpdateUserInput,
  ): Promise<UserModel | null> {
    const existing = await this.database.client.user.findFirst({
      where: { id: userId, organisationId },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    return this.database.client.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
      },
      select: userSelect,
    });
  }

  private async lockUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  private async lockOrganisation(
    transaction: Prisma.TransactionClient,
    organisationId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId}::uuid FOR UPDATE`;
  }

  async updateRoleAndRevokeSessions(
    organisationId: string,
    userId: string,
    newRole: UserRole,
  ): Promise<UserModel | null> {
    return this.database.client.$transaction(async (tx) => {
      // If potentially demoting an owner, lock the organisation row to prevent concurrent demotion races.
      await this.lockOrganisation(tx, organisationId);
      await this.lockUser(tx, userId);

      const target = await tx.user.findFirst({
        where: { id: userId, organisationId },
        select: { id: true, role: true },
      });
      if (!target) {
        return null;
      }

      if (target.role === 'OWNER' && newRole !== 'OWNER') {
        const ownerCount = await tx.user.count({
          where: { organisationId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          throw new ConflictException(
            'Cannot change role of the only remaining organisation owner',
          );
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          role: newRole,
          authVersion: { increment: 1 },
        },
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: userSelect,
      });
    });
  }

  countOwners(organisationId: string): Promise<number> {
    return this.database.client.user.count({
      where: { organisationId, role: 'OWNER' },
    });
  }
}
