import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../../services/auth.service.js';
import { LoginDTO, RefreshDTO } from '../dtos/auth.dto.js';

export class AuthController {
  constructor(private service: AuthService = authService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as LoginDTO;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const result = await this.service.login(email, password, clientIp);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshDTO;
      const result = await this.service.refresh(refreshToken);
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

      await this.service.logout(userId, jti, exp);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, organisationId } = req.tenantContext;
      const user = await this.service.getMe(userId, organisationId);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();

