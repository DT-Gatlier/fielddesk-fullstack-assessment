import { Request, Response, NextFunction } from 'express';
import { userRepository } from '../../repositories/user.repository.js';
import { NotFoundError } from '../../domain/errors/index.js';

export class UserController {
  /**
   * Get user by ID scoped strictly to authenticated tenant context.
   * If user ID exists in another tenant, returns 404 Not Found (anti-enumeration).
   */
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { organisationId } = req.tenantContext;

      const user = await userRepository.findUserByIdAndOrg(id, organisationId);
      if (!user) {
        throw new NotFoundError('User not found.');
      }

      res.status(200).json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organisationId: user.organisationId,
          organisationName: user.organisationName,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const userController = new UserController();

