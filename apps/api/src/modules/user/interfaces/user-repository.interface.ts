import type { UserRole } from '@fielddesk/database';

import type {
  CreateUserEntityInput,
  PaginatedUsers,
  PaginationParams,
  UpdateUserInput,
  UserFilterInput,
  UserModel,
} from './user.interface';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findById(organisationId: string, userId: string): Promise<UserModel | null>;
  findByEmail(email: string): Promise<UserModel | null>;
  listByOrganisation(
    organisationId: string,
    filter: UserFilterInput,
    pagination: PaginationParams,
  ): Promise<PaginatedUsers>;
  create(
    organisationId: string,
    input: CreateUserEntityInput,
  ): Promise<UserModel>;
  update(
    organisationId: string,
    userId: string,
    input: UpdateUserInput,
  ): Promise<UserModel | null>;
  updateRoleAndRevokeSessions(
    organisationId: string,
    userId: string,
    newRole: UserRole,
  ): Promise<UserModel | null>;
  countOwners(organisationId: string): Promise<number>;
}
