import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';

/**
 * Ensures that the request is firmly scoped to the authenticated user's organization.
 * MUST be applied to all routes that interact with tenant data.
 * This guarantees we never trust the client's `orgId` input.
 */
export const orgScope = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.orgId) {
    return next(new UnauthorizedError('Organization context missing'));
  }
  
  req.orgId = req.user.orgId;
  next();
};
