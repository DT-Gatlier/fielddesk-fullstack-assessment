import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../domain/models/tenant-context.js';
import { ForbiddenError } from '../../domain/errors/index.js';

export function requireRole(...roles: (UserRole | UserRole[])[]) {
  const flattenedRoles: UserRole[] = roles.flat();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenantContext) {
      next(new ForbiddenError('Tenant context missing from authenticated session.'));
      return;
    }

    if (!flattenedRoles.includes(req.tenantContext.role)) {
      next(
        new ForbiddenError(
          `Access forbidden: required role [${flattenedRoles.join(', ')}], current role is '${req.tenantContext.role}'.`
        )
      );
      return;
    }

    next();
  };
}

