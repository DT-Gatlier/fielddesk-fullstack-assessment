import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { Role } from '@prisma/client';

export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const { role } = req.query;

    const where: any = { orgId };
    if (role) {
      where.role = role as Role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { email: 'asc' },
    });

    res.json({ data: users });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const id = req.params.id;
    const { role } = req.body;

    if (id === req.user!.id) {
      throw new ForbiddenError('Cannot change your own role');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.orgId !== orgId) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role: role as Role },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      }
    });

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};
