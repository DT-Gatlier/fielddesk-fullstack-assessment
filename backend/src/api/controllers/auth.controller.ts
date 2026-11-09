import { Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth.service.js';
import { LoginDTO, RefreshDTO } from '../dtos/auth.dto.js';

export class AuthController {
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as LoginDTO;
      const clientIp = req.ip || req.socket?.remoteAddress || `unknown_${req.correlationId}`;

      const result = await authService.login(email, password, clientIp);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshDTO;
      const result = await authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.tenantContext.userId;
      const jti = req.tokenPayload.jti;
      const exp = req.tokenPayload.exp;

      await authService.logout(userId, jti, exp);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, organisationId } = req.tenantContext;
      const user = await authService.getMe(userId, organisationId);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  };

  getPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role } = req.tenantContext;
      const { getPermissionsForRole } = await import('../../domain/models/permissions.js');
      const permissions = getPermissionsForRole(role);
      res.status(200).json({ role, permissions });
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();

