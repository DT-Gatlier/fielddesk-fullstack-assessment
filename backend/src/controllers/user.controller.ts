import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';

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
    const id = req.params.id as string;
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

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const { email, password, role } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestError('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role as Role,
        orgId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });

    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
};

export const toggleUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const id = req.params.id as string;

    if (id === req.user!.id) {
      throw new ForbiddenError('Cannot deactivate your own account');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.orgId !== orgId) {
      throw new NotFoundError('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
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
