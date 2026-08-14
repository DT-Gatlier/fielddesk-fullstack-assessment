import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError } from '../utils/errors';

export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('User not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Role ${req.user.role} is not authorized to access this resource`));
    }

    next();
  };
};
