import type { components } from '@/api/schema';

export type UserResDto = components['schemas']['UserResDto'];
export type UserListResDto = components['schemas']['UserListResDto'];
export type CreateUserDto = components['schemas']['CreateUserDto'];
export type UpdateUserDto = components['schemas']['UpdateUserDto'];
export type UpdateUserRoleDto = components['schemas']['UpdateUserRoleDto'];
export type UserRole = components['schemas']['UserResDto']['role'];
