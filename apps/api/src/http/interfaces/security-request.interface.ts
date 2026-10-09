import type { Request, Response, NextFunction } from 'express';

import type { SecurityState } from '../../modules/auth/interfaces/auth-security-state.interface';

export interface SecurityRequest extends Request {
  requestId: string;
  security: SecurityState;
}

export type SecurityMiddleware = (
  request: SecurityRequest,
  response: Response,
  next: NextFunction,
) => void;
