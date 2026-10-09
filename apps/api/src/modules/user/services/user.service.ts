import { normalizeEmail } from '@fielddesk/database';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { argon2id, hash } from 'argon2';

import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import { USER_REPOSITORY } from '../interfaces/user-repository.interface';
import type { UserRepositoryPort } from '../interfaces/user-repository.interface';
import type {
  CreateUserInput,
  PaginatedUsers,
  PaginationParams,
  UpdateUserInput,
  UpdateUserRoleInput,
  UserFilterInput,
  UserModel,
} from '../interfaces/user.interface';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: UserRepositoryPort,
  ) {}

  async getById(context: TenantContext, userId: string): Promise<UserModel> {
    const user = await this.repository.findById(context.organisationId, userId);
    if (!user) {
      throw new NotFoundException('Resource not found');
    }
    return user;
  }

  list(
    context: TenantContext,
    filter: UserFilterInput,
    pagination: PaginationParams,
  ): Promise<PaginatedUsers> {
    return this.repository.listByOrganisation(
      context.organisationId,
      filter,
      pagination,
    );
  }

  async create(
    context: TenantContext,
    input: CreateUserInput,
  ): Promise<UserModel> {
    const normalized = normalizeEmail(input.email);
    const existing = await this.repository.findByEmail(normalized);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(input.password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    return this.repository.create(context.organisationId, {
      email: normalized,
      name: input.name.trim(),
      passwordHash,
      role: input.role,
    });
  }

  async update(
    context: TenantContext,
    userId: string,
    input: UpdateUserInput,
  ): Promise<UserModel> {
    const updated = await this.repository.update(
      context.organisationId,
      userId,
      {
        name: input.name ? input.name.trim() : undefined,
      },
    );
    if (!updated) {
      throw new NotFoundException('Resource not found');
    }
    return updated;
  }

  async updateRole(
    context: TenantContext,
    userId: string,
    input: UpdateUserRoleInput,
  ): Promise<UserModel> {
    const existing = await this.repository.findById(
      context.organisationId,
      userId,
    );
    if (!existing) {
      throw new NotFoundException('Resource not found');
    }

    const updated = await this.repository.updateRoleAndRevokeSessions(
      context.organisationId,
      userId,
      input.role,
    );
    if (!updated) {
      throw new NotFoundException('Resource not found');
    }
    return updated;
  }
}
