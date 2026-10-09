import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator, SetMetadata } from '@nestjs/common';

import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import type { SecurityRequest } from '../interfaces/security-request.interface';

export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata('public', true);
export type Permission =
  | 'work:manage'
  | 'work:assigned'
  | 'progress:write'
  | 'users:manage'
  | 'settings:manage';
export const RequirePermission = (
  permission: Permission | Permission[],
): ReturnType<typeof SetMetadata> => SetMetadata('permission', permission);
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Identity | undefined =>
    context.switchToHttp().getRequest<SecurityRequest>().security.identity,
);
