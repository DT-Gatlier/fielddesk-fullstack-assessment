import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Permission } from '../decorators/auth.decorators';
import type { SecurityRequest } from '../interfaces/security-request.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) {
      return true;
    }
    const identity = context.switchToHttp().getRequest<SecurityRequest>()
      .security?.identity;
    if (!identity) {
      throw new UnauthorizedException('Authentication required');
    }
    const permission = this.reflector.getAllAndOverride<
      Permission | Permission[]
    >('permission', targets);
    const permissions: Record<typeof identity.role, Permission[]> = {
      OWNER: ['work:manage', 'users:manage', 'settings:manage'],
      DISPATCHER: ['work:manage'],
      TECHNICIAN: ['work:assigned', 'progress:write'],
    };
    if (permission) {
      const userPermissions = permissions[identity.role];
      const hasPermission = Array.isArray(permission)
        ? permission.some((p) => userPermissions.includes(p))
        : userPermissions.includes(permission);
      if (!hasPermission) {
        throw new ForbiddenException('Permission denied');
      }
    }
    return true;
  }
}
